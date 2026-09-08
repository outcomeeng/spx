/**
 * The methodology fetch: reads `outcomeeng/plugins` at one revision and
 * writes each coding agent's built understand skill into spx's shipped layout
 * under `methodology/{MAJOR.MINOR}/`, beside a record naming the revision.
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

import { cp, mkdir, readFile as nodeReadFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Command, CommanderError } from "commander";

import type { Result } from "@/config/types";
import { GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";

import {
  formatMethodologyLineInvalidError,
  formatMethodologySourceRecord,
  FOUNDATION_PLUGIN_NAME,
  isMethodologyLine,
  isPlainSegment,
  METHODOLOGY_TREE_ROOT,
  methodologyLine,
  methodologyLineRelativeDir,
  type MethodologySourcePlugin,
  type MethodologySourceRecord,
  methodologyTreeRelativeDir,
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

/** Where each coding agent's built plugin lives in the plugins repository, and where its manifest sits inside it. */
export const FETCH_CODING_AGENTS = {
  claude: {
    distRelativeDir: "dist/claude/spec-tree",
    pluginManifestRelativePath: ".claude-plugin/plugin.json",
  },
  codex: {
    distRelativeDir: "dist/codex/spec-tree",
    pluginManifestRelativePath: ".codex-plugin/plugin.json",
  },
} as const;

export type FetchCodingAgent = keyof typeof FETCH_CODING_AGENTS;

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
const ARGUMENT_TERMINATOR = "--";

/** What the fetch reads from one coding agent's plugin manifest. */
export type PluginManifest = MethodologySourcePlugin;

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

/** Parses the fetch's command line through the repository's canonical parser. */
export function parseFetchArguments(argv: readonly string[]): Result<MethodologyFetchArguments> {
  const command = new Command()
    .exitOverride()
    .configureOutput({ writeErr: () => undefined, writeOut: () => undefined })
    .option(FETCH_ARGUMENT_DEFINITIONS.REVISION, "branch, tag, or commit to read", FETCH_DEFAULT_REVISION)
    .option(FETCH_ARGUMENT_DEFINITIONS.LINE, "methodology line when no plugin manifest declares it")
    .allowExcessArguments(false);
  // A package-script boundary forwards `--` literally; it separates nothing here.
  const arguments_ = argv[0] === ARGUMENT_TERMINATOR ? argv.slice(1) : [...argv];
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
  readonly codingAgent: FetchCodingAgent;
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
  readonly manifests: Readonly<Record<FetchCodingAgent, string>>;
}

/** Diagnostic for a fetch that can take its line from no manifest and no argument. */
export function formatFetchLineUndeclaredError(): string {
  return `No plugin manifest declares ${PLUGIN_MANIFEST_FIELDS.METHODOLOGY}.${PLUGIN_MANIFEST_FIELDS.PROVIDES};`
    + ` name the line with ${FETCH_ARGUMENT_FLAGS.LINE}`;
}

/** Diagnostic for coding agents whose manifests provide different lines. */
export function formatFetchLineDisagreementError(lines: Readonly<Record<string, string>>): string {
  const detail = Object.entries(lines).map(([agent, line]) => `${agent}=${line}`).join(", ");
  return `Plugin manifests disagree on the methodology line they provide: ${detail}`;
}

/** Diagnostic for a named line that differs from the line the manifests provide. */
export function formatFetchLineConflictError(argumentLine: string, providedLine: string): string {
  return `${FETCH_ARGUMENT_FLAGS.LINE} ${argumentLine} conflicts with the line the plugin manifests provide, ${providedLine}`;
}

function fetchCodingAgents(): readonly FetchCodingAgent[] {
  return Object.keys(FETCH_CODING_AGENTS) as FetchCodingAgent[];
}

interface ParsedManifests {
  readonly plugins: Readonly<Record<string, MethodologySourcePlugin>>;
  /** The line each coding agent's manifest provides, for those that declare one. */
  readonly providedLines: Readonly<Record<string, string>>;
}

function parseManifests(manifests: Readonly<Record<FetchCodingAgent, string>>): Result<ParsedManifests> {
  const plugins: Record<string, MethodologySourcePlugin> = {};
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

/** Derives the line, the copy set, and the source record from the fetched manifests and arguments. */
export function planMethodologyFetch(input: MethodologyFetchPlanInput): Result<MethodologyFetchPlan> {
  if (input.line !== undefined && !isMethodologyLine(input.line)) {
    return { ok: false, error: formatMethodologyLineInvalidError(input.line) };
  }
  const parsed = parseManifests(input.manifests);
  if (!parsed.ok) return parsed;
  const line = selectLine(parsed.value.providedLines, input.line);
  if (!line.ok) return line;
  const lineRelativeDir = methodologyLineRelativeDir(line.value);
  if (!lineRelativeDir.ok) return lineRelativeDir;
  const copies: MethodologyFetchCopy[] = [];
  for (const codingAgent of fetchCodingAgents()) {
    const treeRelativeDir = methodologyTreeRelativeDir(line.value, codingAgent, FOUNDATION_PLUGIN_NAME);
    if (!treeRelativeDir.ok) return treeRelativeDir;
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
      sourceRecord: { repository: input.repository, revision: input.revision, plugins: parsed.value.plugins },
    },
  };
}

export interface MethodologyFetchFileSystem {
  readFile(path: string): Promise<string>;
  /** Removes `path` and everything under it; an absent path is not an error. */
  removeTree(path: string): Promise<void>;
  /** Copies the directory at `from` to `to`, creating parents. */
  copyTree(from: string, to: string): Promise<void>;
  writeFile(path: string, text: string): Promise<void>;
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
  const checkout = await git(gitDependencies, cloneDir, [GIT_CHECKOUT_COMMAND, options.revision]);
  if (!checkout.ok) return checkout;
  return git(gitDependencies, cloneDir, [GIT_REV_PARSE.COMMAND, GIT_REV_PARSE.HEAD]);
}

async function readPluginManifests(
  cloneDir: string,
  fs: MethodologyFetchFileSystem,
): Promise<Result<Readonly<Record<FetchCodingAgent, string>>>> {
  const manifests: Partial<Record<FetchCodingAgent, string>> = {};
  for (const codingAgent of fetchCodingAgents()) {
    const layout = FETCH_CODING_AGENTS[codingAgent];
    try {
      manifests[codingAgent] = await fs.readFile(
        join(cloneDir, layout.distRelativeDir, layout.pluginManifestRelativePath),
      );
    } catch (error) {
      return {
        ok: false,
        error: `${codingAgent}: plugin manifest unreadable at ${layout.pluginManifestRelativePath}: ${String(error)}`,
      };
    }
  }
  return { ok: true, value: manifests as Readonly<Record<FetchCodingAgent, string>> };
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
 * fetched manifests, replaces the target line directory, and writes the source
 * record. A line named on the command line is validated before any clone.
 */
export async function runMethodologyFetch(options: MethodologyFetchOptions): Promise<Result<MethodologyFetchOutcome>> {
  if (options.line !== undefined && (!isMethodologyLine(options.line) || !isPlainSegment(options.line))) {
    return { ok: false, error: formatMethodologyLineInvalidError(options.line) };
  }
  const cloneDir = await options.dependencies.createCloneDir();
  const revision = await cloneAtRevision(options, cloneDir);
  if (!revision.ok) return revision;
  const manifests = await readPluginManifests(cloneDir, options.dependencies.fs);
  if (!manifests.ok) return manifests;
  const plan = planMethodologyFetch({
    repository: options.repository,
    revision: revision.value,
    ...(options.line === undefined ? {} : { line: options.line }),
    manifests: manifests.value,
  });
  if (!plan.ok) return plan;
  const lineDir = await applyFetchPlan(plan.value, cloneDir, options.packageRoot, options.dependencies.fs);
  return { ok: true, value: { line: plan.value.line, revision: revision.value, lineDir } };
}

/** The package-relative root every fetch writes under. */
export const METHODOLOGY_FETCH_TARGET_ROOT = METHODOLOGY_TREE_ROOT;
