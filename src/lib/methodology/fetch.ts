/**
 * The methodology fetch: reads `outcomeeng/plugins` at one revision and
 * writes each coding agent's built understand skill into spx's shipped layout
 * under `methodology/{MAJOR.MINOR}/`, beside a record naming the revision, the
 * instruction-template version, and the spx-owned migration files.
 *
 * Planning — argument parsing, line derivation from the fetched plugin
 * manifests, the copy set, and the source record — is pure over supplied
 * values. The two effects, a sparse blobless clone and the replacement of the
 * target line directory, enter through injected git and filesystem interfaces,
 * so the fetch verifies against a local repository shaped like the plugins
 * repository's `dist/` layout.
 *
 * @module lib/methodology/fetch
 */

import type { Dirent } from "node:fs";
import { cp, mkdir, readdir, readFile as nodeReadFile, rm, stat, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";

import { Command, CommanderError } from "commander";

import type { Result } from "@/config/types";

import { GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";

import { METHODOLOGY_CODING_AGENT, METHODOLOGY_CODING_AGENTS, type MethodologyCodingAgent } from "./coding-agent";
import { type MethodologyPackagingFileSystem, validateMethodologyPackaging } from "./packaging";
import {
  compareCodeUnitOrder,
  formatMethodologyLineInvalidError,
  formatMethodologySourceRecord,
  formatMethodologyVersionName,
  FOUNDATION_PLUGIN_NAME,
  isMethodologyLine,
  isPlainSegment,
  METHODOLOGY_TREE_ROOT,
  methodologyLine,
  methodologyLineRelativeDir,
  methodologyMigrationDir,
  methodologyMigrationRelativeDir,
  type MethodologySourcePlugin,
  type MethodologySourceRecord,
  methodologyTreeRelativeDir,
  MIGRATION_ENTRY_FILE_NAME,
  SOURCE_RECORD_RELATIVE_PATH,
} from "./tree";

/** The repository the methodology plugins are published from, as `owner/repository`. */
export const PLUGINS_REPOSITORY = "outcomeeng/plugins";

/** Clone URL of the plugins repository. */
export const PLUGINS_REPOSITORY_URL = `https://github.com/${PLUGINS_REPOSITORY}.git`;

/** The revision the fetch reads when none is named. */
export const FETCH_DEFAULT_REVISION = "main";

/** Plugin-relative directory of the understand skill, the one directory the fetch copies per coding agent. */
export const UNDERSTAND_SKILL_RELATIVE_DIR = "skills/understand";

/** Plugin-relative path of the instruction-block template, the one value both coding agents' builds share. */
export const INSTRUCTION_TEMPLATE_RELATIVE_PATH = "skills/update-instruction-block/templates/instruction-block.md";

const TEMPLATE_VERSION_KEY = "template_version";
const FRONT_MATTER_DELIMITER = "---";
const TEMPLATE_VERSION_PATTERN = new RegExp(String.raw`^${TEMPLATE_VERSION_KEY}:\s*(.*?)\s*$`);
const DOUBLE_QUOTE = "\"";
const POSIX_SEPARATOR = "/";
const ERROR_CODE_ABSENT = "ENOENT";

/** Where one coding agent's built plugin lives in the plugins repository, and where its manifest sits inside it. */
export interface FetchCodingAgentLocations {
  readonly distRelativeDir: string;
  readonly pluginManifestRelativePath: string;
}

/** Those locations for every coding agent the shipped layout names, so the two registries cannot diverge. */
export const FETCH_CODING_AGENTS: Readonly<Record<MethodologyCodingAgent, FetchCodingAgentLocations>> = {
  [METHODOLOGY_CODING_AGENT.CLAUDE]: {
    distRelativeDir: "dist/claude/spec-tree",
    pluginManifestRelativePath: ".claude-plugin/plugin.json",
  },
  [METHODOLOGY_CODING_AGENT.CODEX]: {
    distRelativeDir: "dist/codex/spec-tree",
    pluginManifestRelativePath: ".codex-plugin/plugin.json",
  },
};

export const FETCH_ARGUMENT_FLAGS = {
  REVISION: "--revision",
  LINE: "--line",
} as const;

const FETCH_ARGUMENT_DEFINITIONS = {
  REVISION: `${FETCH_ARGUMENT_FLAGS.REVISION} <ref>`,
  LINE: `${FETCH_ARGUMENT_FLAGS.LINE} <MAJOR.MINOR>`,
} as const;

export const PLUGIN_MANIFEST_FIELDS = {
  NAME: "name",
  VERSION: "version",
  METHODOLOGY: "methodology",
  PROVIDES: "provides",
  SUPPORTS: "supports",
} as const;

const GIT_CLONE = {
  COMMAND: "clone",
  NO_CHECKOUT: "--no-checkout",
  BLOBLESS_FILTER: "--filter=blob:none",
} as const;
const GIT_SPARSE_CHECKOUT = { COMMAND: "sparse-checkout", SET: "set", NO_CONE: "--no-cone" } as const;
const GIT_CHECKOUT_COMMAND = "checkout";
const GIT_REV_PARSE = { COMMAND: "rev-parse", HEAD: "HEAD" } as const;
const COMMANDER_PARSE_FROM = "user";
/** The token a package-script boundary forwards before the fetch arguments; it separates nothing here. */
export const FETCH_ARGUMENT_TERMINATOR = "--";

/** What the fetch reads from one coding agent's plugin manifest; a manifest carries no migration. */
export type PluginManifest = Omit<MethodologySourcePlugin, "migration">;

export interface MethodologyFetchArguments {
  readonly revision: string;
  readonly line?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, field: string): string | undefined {
  const raw = record[field];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/** Parses a plugin manifest, requiring its name and version and reading the methodology block when present. */
export function parsePluginManifest(text: string): Result<PluginManifest> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "plugin manifest is not valid JSON" };
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: "plugin manifest must be a JSON object" };
  }
  const name = readString(parsed, PLUGIN_MANIFEST_FIELDS.NAME);
  const version = readString(parsed, PLUGIN_MANIFEST_FIELDS.VERSION);
  if (name === undefined || version === undefined) {
    return {
      ok: false,
      error: `plugin manifest must carry ${PLUGIN_MANIFEST_FIELDS.NAME} and ${PLUGIN_MANIFEST_FIELDS.VERSION}`,
    };
  }
  const methodology = parsed[PLUGIN_MANIFEST_FIELDS.METHODOLOGY];
  if (methodology === undefined) {
    return { ok: true, value: { name, version } };
  }
  if (!isRecord(methodology)) {
    return { ok: false, error: `plugin manifest ${PLUGIN_MANIFEST_FIELDS.METHODOLOGY} must be an object` };
  }
  const provides = readString(methodology, PLUGIN_MANIFEST_FIELDS.PROVIDES);
  const supports = readString(methodology, PLUGIN_MANIFEST_FIELDS.SUPPORTS);
  if (provides === undefined) {
    return {
      ok: false,
      error: `plugin manifest ${PLUGIN_MANIFEST_FIELDS.METHODOLOGY} must carry ${PLUGIN_MANIFEST_FIELDS.PROVIDES}`,
    };
  }
  return { ok: true, value: { name, version, provides, ...(supports === undefined ? {} : { supports }) } };
}

/**
 * Reads `template_version` from the front matter between the first two `---`
 * lines of the instruction-block template, without its quotes.
 */
export function parseInstructionTemplateVersion(text: string): Result<string> {
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  const delimiters = lines.flatMap((line, index) => (line === FRONT_MATTER_DELIMITER ? [index] : []));
  if (delimiters.length < 2) {
    return { ok: false, error: "instruction template carries no front matter" };
  }
  for (const line of lines.slice(delimiters[0] + 1, delimiters[1])) {
    const match = TEMPLATE_VERSION_PATTERN.exec(line);
    if (match === null) continue;
    const raw = match[1];
    const value = raw.length >= 2 && raw.startsWith(DOUBLE_QUOTE) && raw.endsWith(DOUBLE_QUOTE)
      ? raw.slice(1, -1)
      : raw;
    return value.length === 0
      ? { ok: false, error: `instruction template ${TEMPLATE_VERSION_KEY} is empty` }
      : { ok: true, value };
  }
  return { ok: false, error: `instruction template carries no ${TEMPLATE_VERSION_KEY}` };
}

/** Parses the fetch's command line through the repository's canonical parser. */
export function parseFetchArguments(argv: readonly string[]): Result<MethodologyFetchArguments> {
  const command = new Command()
    .exitOverride()
    .configureOutput({ writeErr: () => undefined, writeOut: () => undefined })
    .option(FETCH_ARGUMENT_DEFINITIONS.REVISION, "branch, tag, or commit to read", FETCH_DEFAULT_REVISION)
    .option(FETCH_ARGUMENT_DEFINITIONS.LINE, "methodology line when no plugin manifest declares it")
    .allowExcessArguments(false);
  // A package-script boundary forwards `--` literally; it separates nothing here.
  const arguments_ = argv[0] === FETCH_ARGUMENT_TERMINATOR ? argv.slice(1) : [...argv];
  try {
    command.parse(arguments_, { from: COMMANDER_PARSE_FROM });
  } catch (error) {
    if (error instanceof CommanderError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
  const options = command.opts<{ revision: string; line?: string }>();
  if (options.line !== undefined && !isMethodologyLine(options.line)) {
    return { ok: false, error: formatMethodologyLineInvalidError(options.line) };
  }
  return {
    ok: true,
    value: { revision: options.revision, ...(options.line === undefined ? {} : { line: options.line }) },
  };
}

/** One copy the fetch performs: a coding agent's understand skill from the clone into the shipped layout. */
export interface MethodologyFetchCopy {
  readonly codingAgent: MethodologyCodingAgent;
  /** Clone-relative source directory. */
  readonly from: string;
  /** Package-relative target directory. */
  readonly to: string;
}

export interface MethodologyFetchPlan {
  readonly line: string;
  /** Package-relative directory the fetch replaces. */
  readonly lineRelativeDir: string;
  readonly copies: readonly MethodologyFetchCopy[];
  readonly sourceRecord: MethodologySourceRecord;
}

export interface MethodologyFetchPlanInput {
  readonly repository: string;
  /** The commit the revision resolved to. */
  readonly revision: string;
  /** The line named on the command line, when any. */
  readonly line?: string;
  /** Each coding agent's plugin-manifest text at the revision. */
  readonly manifests: Readonly<Record<MethodologyCodingAgent, string>>;
  /** Each coding agent's instruction-template file text at the revision. */
  readonly templates: Readonly<Record<MethodologyCodingAgent, string>>;
  /** The file names directly inside each coding agent's migration directory. */
  readonly migrationFiles: Readonly<Record<MethodologyCodingAgent, readonly string[]>>;
}

/** Diagnostic for a fetch that can take its line from no manifest and no argument. */
export function formatFetchLineUndeclaredError(): string {
  return `No plugin manifest declares ${PLUGIN_MANIFEST_FIELDS.METHODOLOGY}.${PLUGIN_MANIFEST_FIELDS.PROVIDES};`
    + ` name the methodology version with ${FETCH_ARGUMENT_DEFINITIONS.LINE}`;
}

/** Diagnostic for coding agents whose manifests provide different lines, each named as a methodology version. */
export function formatFetchLineDisagreementError(lines: Readonly<Record<string, string>>): string {
  const detail = Object.entries(lines)
    .map(([agent, line]) => `${agent} provides ${formatMethodologyVersionName(line)}`)
    .join(", ");
  return `Plugin manifests disagree on the methodology they provide: ${detail}`;
}

/** Diagnostic for a named line that differs from the line the manifests provide. */
export function formatFetchLineConflictError(argumentLine: string, providedLine: string): string {
  return `The named ${formatMethodologyVersionName(argumentLine)} conflicts with ${
    formatMethodologyVersionName(providedLine)
  }, which the plugin manifests provide`;
}

function fetchCodingAgents(): readonly MethodologyCodingAgent[] {
  return METHODOLOGY_CODING_AGENTS;
}

interface ParsedManifests {
  readonly plugins: Readonly<Record<string, PluginManifest>>;
  /** The line each coding agent's manifest provides, for those that declare one. */
  readonly providedLines: Readonly<Record<string, string>>;
}

function parseManifests(manifests: Readonly<Record<MethodologyCodingAgent, string>>): Result<ParsedManifests> {
  const plugins: Record<string, PluginManifest> = {};
  const providedLines: Record<string, string> = {};
  for (const codingAgent of fetchCodingAgents()) {
    const manifest = parsePluginManifest(manifests[codingAgent]);
    if (!manifest.ok) {
      return { ok: false, error: `${codingAgent}: ${manifest.error}` };
    }
    plugins[codingAgent] = manifest.value;
    if (manifest.value.provides !== undefined) {
      const line = methodologyLine(manifest.value.provides);
      if (!line.ok) {
        return { ok: false, error: `${codingAgent}: ${line.error}` };
      }
      providedLines[codingAgent] = line.value;
    }
  }
  return { ok: true, value: { plugins, providedLines } };
}

/** The one line the manifests provide, reconciled with the line named on the command line. */
function selectLine(providedLines: Readonly<Record<string, string>>, argumentLine: string | undefined): Result<string> {
  const distinctProvided = [...new Set(Object.values(providedLines))];
  if (distinctProvided.length > 1) {
    return { ok: false, error: formatFetchLineDisagreementError(providedLines) };
  }
  const providedLine = distinctProvided.at(0);
  if (providedLine !== undefined && argumentLine !== undefined && providedLine !== argumentLine) {
    return { ok: false, error: formatFetchLineConflictError(argumentLine, providedLine) };
  }
  const line = providedLine ?? argumentLine;
  return line === undefined ? { ok: false, error: formatFetchLineUndeclaredError() } : { ok: true, value: line };
}

/** The line a plan over these manifests and this argument selects. */
export function selectMethodologyFetchLine(
  manifests: Readonly<Record<MethodologyCodingAgent, string>>,
  argumentLine?: string,
): Result<string> {
  const parsed = parseManifests(manifests);
  if (!parsed.ok) return parsed;
  return selectLine(parsed.value.providedLines, argumentLine);
}

/** The one template version every coding agent's build carries, or a failure naming the template source. */
function selectTemplateVersion(templates: Readonly<Record<MethodologyCodingAgent, string>>): Result<string> {
  const versions: Record<string, string> = {};
  for (const codingAgent of fetchCodingAgents()) {
    const version = parseInstructionTemplateVersion(templates[codingAgent]);
    if (!version.ok) {
      return { ok: false, error: `${INSTRUCTION_TEMPLATE_RELATIVE_PATH} (${codingAgent}): ${version.error}` };
    }
    versions[codingAgent] = version.value;
  }
  const distinct = [...new Set(Object.values(versions))];
  if (distinct.length > 1) {
    const detail = Object.entries(versions).map(([agent, version]) => `${agent} ${version}`).join(", ");
    return {
      ok: false,
      error: `${INSTRUCTION_TEMPLATE_RELATIVE_PATH} carries different ${TEMPLATE_VERSION_KEY} values: ${detail}`,
    };
  }
  return { ok: true, value: distinct[0] };
}

/** Derives the line, the copy set, and the source record from the fetched manifests, templates, and arguments. */
export function planMethodologyFetch(input: MethodologyFetchPlanInput): Result<MethodologyFetchPlan> {
  if (input.line !== undefined && !isMethodologyLine(input.line)) {
    return { ok: false, error: formatMethodologyLineInvalidError(input.line) };
  }
  const parsed = parseManifests(input.manifests);
  if (!parsed.ok) return parsed;
  const line = selectLine(parsed.value.providedLines, input.line);
  if (!line.ok) return line;
  const templateVersion = selectTemplateVersion(input.templates);
  if (!templateVersion.ok) return templateVersion;
  const lineRelativeDir = methodologyLineRelativeDir(line.value);
  if (!lineRelativeDir.ok) return lineRelativeDir;
  const plugins: Record<string, MethodologySourcePlugin> = {};
  const copies: MethodologyFetchCopy[] = [];
  for (const codingAgent of fetchCodingAgents()) {
    const treeRelativeDir = methodologyTreeRelativeDir(line.value, codingAgent, FOUNDATION_PLUGIN_NAME);
    if (!treeRelativeDir.ok) return treeRelativeDir;
    const migrationRelativeDir = methodologyMigrationRelativeDir(line.value, codingAgent);
    if (!migrationRelativeDir.ok) return migrationRelativeDir;
    const migrationPath = (fileName: string): string =>
      [...migrationRelativeDir.value.split(sep), fileName].join(POSIX_SEPARATOR);
    const files = input.migrationFiles[codingAgent];
    plugins[codingAgent] = {
      ...parsed.value.plugins[codingAgent],
      migration: {
        entries: files.includes(MIGRATION_ENTRY_FILE_NAME) ? [migrationPath(MIGRATION_ENTRY_FILE_NAME)] : [],
        instructions: files
          .filter((file) => file !== MIGRATION_ENTRY_FILE_NAME)
          .sort(compareCodeUnitOrder)
          .map(migrationPath),
      },
    };
    copies.push({
      codingAgent,
      from: join(FETCH_CODING_AGENTS[codingAgent].distRelativeDir, UNDERSTAND_SKILL_RELATIVE_DIR),
      to: join(treeRelativeDir.value, UNDERSTAND_SKILL_RELATIVE_DIR),
    });
  }
  return {
    ok: true,
    value: {
      line: line.value,
      lineRelativeDir: lineRelativeDir.value,
      copies,
      sourceRecord: {
        repository: input.repository,
        revision: input.revision,
        template: {
          version: templateVersion.value,
          repository: input.repository,
          path: INSTRUCTION_TEMPLATE_RELATIVE_PATH,
          commit: input.revision,
        },
        plugins,
      },
    },
  };
}

export interface MethodologyFetchFileSystem extends MethodologyPackagingFileSystem {
  /** File names, not paths, of the regular files directly inside `directory`, in code-unit order; empty when absent. */
  listFiles(directory: string): Promise<readonly string[]>;
  readFile(path: string): Promise<string>;
  /** Removes `path` and everything under it; an absent path is not an error. */
  removeTree(path: string): Promise<void>;
  /** Copies the directory at `from` to `to`, creating parents. */
  copyTree(from: string, to: string): Promise<void>;
  writeFile(path: string, text: string): Promise<void>;
}

function isAbsentError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === ERROR_CODE_ABSENT;
}

export const defaultMethodologyFetchFileSystem: MethodologyFetchFileSystem = {
  readFile: (path) => nodeReadFile(path, "utf8"),
  removeTree: (path) => rm(path, { recursive: true, force: true }),
  copyTree: async (from, to) => {
    await mkdir(join(to, ".."), { recursive: true });
    await cp(from, to, { recursive: true });
  },
  writeFile: async (path, text) => {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, text);
  },
  listFiles: async (directory) => {
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isAbsentError(error)) return [];
      throw error;
    }
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort(compareCodeUnitOrder);
  },
  isFile: async (path) => {
    try {
      return (await stat(path)).isFile();
    } catch (error) {
      if (isAbsentError(error)) return false;
      throw error;
    }
  },
};

export interface MethodologyFetchDependencies {
  readonly git: GitDependencies;
  readonly fs: MethodologyFetchFileSystem;
  /** An empty directory the clone may occupy; the caller owns its removal. */
  createCloneDir(): Promise<string>;
}

export interface MethodologyFetchOptions extends MethodologyFetchArguments {
  readonly repository: string;
  readonly repositoryUrl: string;
  /** Absolute path of spx's package root, the parent of `methodology/`. */
  readonly packageRoot: string;
  readonly dependencies: MethodologyFetchDependencies;
}

export interface MethodologyFetchOutcome {
  readonly line: string;
  readonly revision: string;
  /** Absolute directory the fetch replaced. */
  readonly lineDir: string;
}

async function git(
  dependencies: GitDependencies,
  cwd: string,
  args: readonly string[],
): Promise<Result<string>> {
  const result = await dependencies.execa(GIT_ROOT_COMMAND.EXECUTABLE, [...args], { cwd, reject: false });
  if (result.exitCode !== 0) {
    return { ok: false, error: `git ${args.join(" ")} failed: ${result.stderr.trim()}` };
  }
  return { ok: true, value: result.stdout.trim() };
}

async function cloneAtRevision(
  options: MethodologyFetchOptions,
  cloneDir: string,
): Promise<Result<string>> {
  const { git: gitDependencies } = options.dependencies;
  const clone = await git(gitDependencies, options.packageRoot, [
    GIT_CLONE.COMMAND,
    GIT_CLONE.NO_CHECKOUT,
    GIT_CLONE.BLOBLESS_FILTER,
    options.repositoryUrl,
    cloneDir,
  ]);
  if (!clone.ok) return clone;
  const sparse = await git(gitDependencies, cloneDir, [
    GIT_SPARSE_CHECKOUT.COMMAND,
    GIT_SPARSE_CHECKOUT.SET,
    GIT_SPARSE_CHECKOUT.NO_CONE,
    ...fetchCodingAgents().map((codingAgent) => `/${FETCH_CODING_AGENTS[codingAgent].distRelativeDir}/`),
  ]);
  if (!sparse.ok) return sparse;
  // --end-of-options keeps an option-shaped revision from being read as a flag.
  const checkout = await git(gitDependencies, cloneDir, [
    GIT_CHECKOUT_COMMAND,
    GIT_ROOT_COMMAND.END_OF_OPTIONS,
    options.revision,
  ]);
  if (!checkout.ok) return checkout;
  return git(gitDependencies, cloneDir, [GIT_REV_PARSE.COMMAND, GIT_REV_PARSE.HEAD]);
}

async function readPluginFiles(
  cloneDir: string,
  fs: MethodologyFetchFileSystem,
  subject: string,
  relativePath: (layout: FetchCodingAgentLocations) => string,
): Promise<Result<Readonly<Record<MethodologyCodingAgent, string>>>> {
  const texts: Partial<Record<MethodologyCodingAgent, string>> = {};
  for (const codingAgent of fetchCodingAgents()) {
    const layout = FETCH_CODING_AGENTS[codingAgent];
    const path = relativePath(layout);
    try {
      texts[codingAgent] = await fs.readFile(join(cloneDir, layout.distRelativeDir, path));
    } catch (error) {
      return { ok: false, error: `${codingAgent}: ${subject} unreadable at ${path}: ${String(error)}` };
    }
  }
  return { ok: true, value: texts as Readonly<Record<MethodologyCodingAgent, string>> };
}

async function listMigrationFiles(
  packageRoot: string,
  line: string,
  fs: MethodologyFetchFileSystem,
): Promise<Result<Readonly<Record<MethodologyCodingAgent, readonly string[]>>>> {
  const files: Partial<Record<MethodologyCodingAgent, readonly string[]>> = {};
  for (const codingAgent of fetchCodingAgents()) {
    const directory = methodologyMigrationDir(packageRoot, line, codingAgent);
    if (!directory.ok) return directory;
    files[codingAgent] = await fs.listFiles(directory.value);
  }
  return { ok: true, value: files as Readonly<Record<MethodologyCodingAgent, readonly string[]>> };
}

async function applyFetchPlan(
  plan: MethodologyFetchPlan,
  cloneDir: string,
  packageRoot: string,
  fs: MethodologyFetchFileSystem,
): Promise<string> {
  const lineDir = join(packageRoot, plan.lineRelativeDir);
  await fs.removeTree(lineDir);
  for (const copy of plan.copies) {
    await fs.copyTree(join(cloneDir, copy.from), join(packageRoot, copy.to));
  }
  await fs.writeFile(join(lineDir, SOURCE_RECORD_RELATIVE_PATH), formatMethodologySourceRecord(plan.sourceRecord));
  return lineDir;
}

/**
 * Clones the plugins repository at the named revision, plans the copy from the
 * fetched manifests and templates and the packaged migration files, validates
 * the planned record's packaging, replaces the target line directory, and
 * writes the source record. A line named on the command line is validated
 * before any clone, and nothing is removed or written before packaging
 * validation passes.
 */
export async function runMethodologyFetch(options: MethodologyFetchOptions): Promise<Result<MethodologyFetchOutcome>> {
  if (options.line !== undefined && (!isMethodologyLine(options.line) || !isPlainSegment(options.line))) {
    return { ok: false, error: formatMethodologyLineInvalidError(options.line) };
  }
  const { fs } = options.dependencies;
  const cloneDir = await options.dependencies.createCloneDir();
  const revision = await cloneAtRevision(options, cloneDir);
  if (!revision.ok) return revision;
  const manifests = await readPluginFiles(
    cloneDir,
    fs,
    "plugin manifest",
    (layout) => layout.pluginManifestRelativePath,
  );
  if (!manifests.ok) return manifests;
  const line = selectMethodologyFetchLine(manifests.value, options.line);
  if (!line.ok) return line;
  const templates = await readPluginFiles(
    cloneDir,
    fs,
    "instruction template",
    () => INSTRUCTION_TEMPLATE_RELATIVE_PATH,
  );
  if (!templates.ok) return templates;
  const migrationFiles = await listMigrationFiles(options.packageRoot, line.value, fs);
  if (!migrationFiles.ok) return migrationFiles;
  const plan = planMethodologyFetch({
    repository: options.repository,
    revision: revision.value,
    ...(options.line === undefined ? {} : { line: options.line }),
    manifests: manifests.value,
    templates: templates.value,
    migrationFiles: migrationFiles.value,
  });
  if (!plan.ok) return plan;
  const packaging = await validateMethodologyPackaging(
    options.packageRoot,
    plan.value.line,
    plan.value.sourceRecord,
    fs,
  );
  if (!packaging.ok) {
    return { ok: false, error: packaging.failures.map((entry) => entry.message).join("\n") };
  }
  const lineDir = await applyFetchPlan(plan.value, cloneDir, options.packageRoot, fs);
  return { ok: true, value: { line: plan.value.line, revision: revision.value, lineDir } };
}

/** The package-relative root every fetch writes under. */
export const METHODOLOGY_FETCH_TARGET_ROOT = METHODOLOGY_TREE_ROOT;
