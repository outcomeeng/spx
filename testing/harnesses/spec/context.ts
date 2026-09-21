import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join, parse } from "node:path";
import { pathToFileURL } from "node:url";

import { execa } from "execa";
import { build } from "tsup";

import {
  type ContextOptions,
  renderSpecContextJson,
  renderSpecContextText,
  resolveContextManifest,
  type SpecContextManifestResolution,
} from "@/commands/spec/context";
import {
  type ContextShowOptions,
  type ContextShowResult,
  parseSpecContextEntriesJson,
  renderSpecContextEntriesJson,
  resolveContextShow,
} from "@/commands/spec/context-show";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import type { Config } from "@/config/types";
import { formatSpecContextTargetFailure } from "@/interfaces/cli/spec";
import { GIT_LS_FILES_COMMAND } from "@/lib/git/changed-paths";
import { GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";
import { TRACKED_PATH_NUL_SEPARATOR } from "@/lib/git/tracked-paths";
import {
  formatMethodologySourceRecord,
  FOUNDATION_MANIFEST_FIELDS,
  FOUNDATION_MANIFEST_RELATIVE_PATH,
  FOUNDATION_MANIFEST_SCHEMA_VERSION,
  FOUNDATION_PLUGIN_NAME,
  METHODOLOGY_CODING_AGENT,
  METHODOLOGY_TREE_ROOT,
  type MethodologySourceRecord,
  SOURCE_RECORD_RELATIVE_PATH,
} from "@/lib/methodology";
import {
  KIND_REGISTRY,
  renderSpecContextEntries,
  SPEC_CONTEXT_DOCUMENT_OPENING,
  SPEC_CONTEXT_ENTRY_TYPE,
  SPEC_CONTEXT_LIFECYCLE_OVERLAY_PATH,
  SPEC_CONTEXT_OPTIONAL_ARTIFACT,
  SPEC_CONTEXT_SELECTED_METADATA_KEY,
  SPEC_TREE_CONFIG,
  SPEC_TREE_CONFIG_FIELDS,
  SPEC_TREE_GRAMMAR,
  type SpecContextDocumentEntry,
  type SpecContextEntry,
  type SpecContextListedRole,
  type SpecContextManifest,
  type SpecContextReadRole,
} from "@/lib/spec-tree";
import { arbitraryMethodologyVersion, type GeneratedMethodologyVersion } from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  specContextLowerSiblingDirectoryName as lowerSiblingDirectoryName,
  specContextSameIndexSiblingDirectoryName as sameIndexSiblingDirectoryName,
} from "@testing/generators/spec-tree/context-target";
import {
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
  specTreeFixtureNodeDirectoryName,
} from "@testing/generators/spec-tree/spec-tree";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { type CurrentSpecTreeEnv, withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { SPEC_CLI_ISOLATION } from "@testing/harnesses/spec/spec-cli-isolation-contract";
import { SPEC_CLI_NETWORK_GUARD_SOURCE_PATH } from "@testing/harnesses/spec/spec-cli-network-guard";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

export function parseContextManifest(output: string): SpecContextManifest {
  return JSON.parse(output) as SpecContextManifest;
}

/** The entry list of a `show --json` document as the packaged executable wrote it. */
export function parseContextEntries(output: string): readonly SpecContextEntry[] {
  return parseSpecContextEntriesJson(output);
}

/** The `list` handler's resolution: the manifest or the typed target failure, for the test to judge. */
export function contextList(options: ContextOptions): Promise<SpecContextManifestResolution> {
  return resolveContextManifest(options);
}

function unresolvedContextError(
  resolution: { readonly ok: false; readonly failure: Parameters<typeof formatSpecContextTargetFailure>[0] },
): Error {
  return new Error(String(formatSpecContextTargetFailure(resolution.failure)));
}

/** The resolved manifest of a `list` invocation the test expects to succeed; an unresolved target is a setup error. */
export async function contextListManifest(options: ContextOptions): Promise<SpecContextManifest> {
  const resolution = await contextList(options);
  if (!resolution.ok) throw unresolvedContextError(resolution);
  return resolution.manifest;
}

/** The exact JSON text the `list --json` command writes, without the trailing newline. */
export async function contextListJson(options: ContextOptions): Promise<string> {
  return String(renderSpecContextJson(await contextListManifest(options)));
}

/** The exact text the `list` command writes, without the trailing newline. */
export async function contextListText(options: ContextOptions): Promise<string> {
  return String(renderSpecContextText(await contextListManifest(options)));
}

/** The `show` handler's result: the entry stream or the typed target failure, for the test to judge. */
export function contextShow(options: ContextShowOptions): Promise<ContextShowResult> {
  return resolveContextShow(options);
}

/** The entries of a `show` invocation the test expects to succeed; an unresolved target is a setup error. */
export async function contextShowEntries(options: ContextShowOptions): Promise<readonly SpecContextEntry[]> {
  const result = await contextShow(options);
  if (!result.ok) throw unresolvedContextError(result);
  return result.entries;
}

/** The exact text the `show` command relays, without the trailing newline. */
export async function contextShowText(options: ContextShowOptions): Promise<string> {
  return renderSpecContextEntries(await contextShowEntries(options));
}

/** The exact JSON text the `show --json` command writes, without the trailing newline. */
export async function contextShowJson(options: ContextShowOptions): Promise<string> {
  return String(renderSpecContextEntriesJson(await contextShowEntries(options)));
}

/**
 * The diagnostic a failing invocation produces — the rendered target failure
 * or the thrown error's message — and `undefined` when the invocation
 * succeeds. The test owns every predicate over it.
 */
async function contextFailure(
  invoke: () => Promise<
    { readonly ok: boolean } & Partial<{ readonly failure: Parameters<typeof formatSpecContextTargetFailure>[0] }>
  >,
): Promise<string | undefined> {
  try {
    const result = await invoke();
    if (result.ok || result.failure === undefined) return undefined;
    return String(formatSpecContextTargetFailure(result.failure));
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function contextListFailure(options: ContextOptions): Promise<string | undefined> {
  return contextFailure(() => contextList(options));
}

export function contextShowFailure(options: ContextShowOptions): Promise<string | undefined> {
  return contextFailure(() => contextShow(options));
}

/** Paths of the document entries in a `show` stream, in stream order. */
export function documentPaths(entries: readonly SpecContextEntry[]): readonly string[] {
  return entries.flatMap((entry) => entry.type === SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT ? [entry.path] : []);
}

/** Paths of the reference entries in a `show` stream, in stream order. */
export function referencePaths(entries: readonly SpecContextEntry[]): readonly string[] {
  return entries.flatMap((entry) => entry.type === SPEC_CONTEXT_ENTRY_TYPE.REFERENCE ? [entry.path] : []);
}

/** Paths of every entry in a `show` stream, in stream order. */
export function entryPaths(entries: readonly SpecContextEntry[]): readonly string[] {
  return entries.map((entry) => entry.path);
}

/** The document entry at `path`, or `undefined` when the stream carries none. */
export function documentAt(
  entries: readonly SpecContextEntry[],
  path: string,
): SpecContextDocumentEntry | undefined {
  return entries.find((entry): entry is SpecContextDocumentEntry =>
    entry.type === SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT && entry.path === path
  );
}

/**
 * Makes the product directory a git repository whose index tracks the whole
 * `spx/` tree, so root resolution from a nested invocation directory and
 * tracked-path scoping both run through real git rather than the no-git
 * fallback that treats the invocation directory as the product root.
 */
export async function trackSpecTreeInGit(env: CurrentSpecTreeEnv): Promise<void> {
  await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
  await runGit(env.productDir, [GIT_TEST_SUBCOMMANDS.ADD, SPEC_TREE_CONFIG.ROOT_DIRECTORY]);
}

export function trackedSpecContextGitDependencies(
  productDir: string,
  trackedPaths: readonly string[],
): GitDependencies {
  return {
    execa: async (command, args) => {
      if (
        command === GIT_ROOT_COMMAND.EXECUTABLE
        && args.includes(GIT_ROOT_COMMAND.REV_PARSE)
        && args.includes(GIT_ROOT_COMMAND.SHOW_TOPLEVEL)
      ) {
        return { exitCode: 0, stdout: productDir, stderr: "" };
      }
      if (command === GIT_ROOT_COMMAND.EXECUTABLE && args.includes(GIT_LS_FILES_COMMAND)) {
        return { exitCode: 0, stdout: trackedPaths.join(TRACKED_PATH_NUL_SEPARATOR), stderr: "" };
      }
      return { exitCode: 128, stdout: "", stderr: "" };
    },
  };
}

async function buildSpecCliNetworkGuard(isolationDir: string): Promise<string> {
  await build({
    bundle: true,
    clean: false,
    entry: {
      [parse(SPEC_CLI_ISOLATION.NETWORK_GUARD_MODULE).name]: SPEC_CLI_NETWORK_GUARD_SOURCE_PATH,
    },
    format: "esm",
    outDir: isolationDir,
    outExtension: () => ({ js: parse(SPEC_CLI_ISOLATION.NETWORK_GUARD_MODULE).ext }),
    silent: true,
    splitting: false,
    target: "node24",
  });
  return pathToFileURL(join(isolationDir, SPEC_CLI_ISOLATION.NETWORK_GUARD_MODULE)).href;
}

export async function runSpecCli(productDir: string, ...args: readonly string[]) {
  return (await runSpecCliWithIsolation(productDir, ...args)).result;
}

type SpecCliIsolation = {
  readonly env: Record<string, string>;
  readonly nodeArgs: readonly string[];
  readonly networkAttemptsFile: string;
  readonly writableProductDir: string;
};

async function createSpecCliIsolation(productDir: string): Promise<SpecCliIsolation> {
  const isolationDir = join(productDir, SPEC_CLI_ISOLATION.DIRECTORY);
  const homeDir = join(isolationDir, SPEC_CLI_ISOLATION.HOME_DIRECTORY);
  const tempDir = join(isolationDir, SPEC_CLI_ISOLATION.TEMP_DIRECTORY);
  const xdgCacheDir = join(isolationDir, SPEC_CLI_ISOLATION.XDG_CACHE_DIRECTORY);
  const xdgConfigDir = join(isolationDir, SPEC_CLI_ISOLATION.XDG_CONFIG_DIRECTORY);
  const xdgDataDir = join(isolationDir, SPEC_CLI_ISOLATION.XDG_DATA_DIRECTORY);
  const xdgStateDir = join(isolationDir, SPEC_CLI_ISOLATION.XDG_STATE_DIRECTORY);
  const mutableStateDirectories = [homeDir, tempDir, xdgCacheDir, xdgConfigDir, xdgDataDir, xdgStateDir];
  const networkAttemptsFile = join(isolationDir, SPEC_CLI_ISOLATION.NETWORK_ATTEMPTS_FILE);
  await Promise.all(
    mutableStateDirectories.map((path) => mkdir(path, { recursive: true })),
  );
  const networkGuardModule = await buildSpecCliNetworkGuard(isolationDir);
  const writableProductDir = await realpath(productDir);
  return {
    env: {
      HOME: homeDir,
      PATH: process.env.PATH as string,
      [SPEC_CLI_ISOLATION.GIT_EXECUTABLE_ENV]: GIT_ROOT_COMMAND.EXECUTABLE,
      [SPEC_CLI_ISOLATION.GIT_READ_SUBCOMMANDS_ENV]: JSON.stringify([
        GIT_ROOT_COMMAND.REV_PARSE,
        GIT_LS_FILES_COMMAND,
      ]),
      [SPEC_CLI_ISOLATION.NETWORK_ATTEMPTS_ENV]: networkAttemptsFile,
      TEMP: tempDir,
      TMP: tempDir,
      TMPDIR: tempDir,
      XDG_CACHE_HOME: xdgCacheDir,
      XDG_CONFIG_HOME: xdgConfigDir,
      XDG_DATA_HOME: xdgDataDir,
      XDG_STATE_HOME: xdgStateDir,
    },
    nodeArgs: [
      "--no-warnings",
      "--permission",
      "--allow-fs-read=*",
      `--allow-fs-write=${productDir}`,
      `--allow-fs-write=${writableProductDir}`,
      "--allow-child-process",
      "--allow-worker",
      "--import",
      networkGuardModule,
    ],
    networkAttemptsFile,
    writableProductDir,
  };
}

async function runIsolatedNodeEntry(
  productDir: string,
  isolation: SpecCliIsolation,
  entryArgs: readonly string[],
  extraEnv?: Record<string, string>,
) {
  return execa(
    NODE_EXECUTABLE,
    [...isolation.nodeArgs, ...entryArgs],
    {
      cwd: productDir,
      env: { ...isolation.env, ...extraEnv },
      extendEnv: false,
      reject: false,
    },
  );
}

export async function runSpecCliWithIsolation(productDir: string, ...args: readonly string[]) {
  return runSpecCliWithIsolationInEnv(productDir, {}, ...args);
}

/** Runs the built CLI under the isolation contract with the supplied variables added to the isolated environment. */
export async function runSpecCliWithIsolationInEnv(
  productDir: string,
  extraEnv: Readonly<Record<string, string>>,
  ...args: readonly string[]
) {
  const isolation = await createSpecCliIsolation(productDir);
  const result = await runIsolatedNodeEntry(productDir, isolation, [CLI_PATH, ...args], { ...extraEnv });
  const networkAttempts = JSON.parse(await readFile(isolation.networkAttemptsFile, "utf8")) as readonly unknown[];
  return {
    networkAttempts,
    productDirectory: isolation.writableProductDir,
    result,
  };
}

const NETWORK_ATTEMPT_PROBE_SCRIPT = "require(\"node:http\").get(\"http://127.0.0.1:1/\");";
const ESCAPE_WRITE_PROBE_SCRIPT =
  `require("node:fs").writeFileSync(process.env.${SPEC_CLI_ISOLATION.ESCAPE_PROBE_PATH_ENV}, "escape");`;

/**
 * Violating fixture for the network-isolation boundary: an isolated
 * subprocess that attempts one outbound HTTP request under the same guard,
 * environment, and permission flags the CLI runs with. The recorded attempts
 * and exit result are observations for the executed test to judge.
 */
export async function runIsolatedNetworkAttemptProbe(productDir: string) {
  const isolation = await createSpecCliIsolation(productDir);
  const result = await runIsolatedNodeEntry(productDir, isolation, ["-e", NETWORK_ATTEMPT_PROBE_SCRIPT]);
  const networkAttempts = JSON.parse(await readFile(isolation.networkAttemptsFile, "utf8")) as readonly unknown[];
  return { networkAttempts, result };
}

/**
 * Violating fixture for the mutable-state boundary: an isolated subprocess
 * that attempts one write to a sibling of the product directory — a path
 * outside every allow-fs-write grant. The exit result and the escape file's
 * existence are observations for the executed test to judge.
 */
export async function runIsolatedEscapeWriteProbe(productDir: string) {
  const isolation = await createSpecCliIsolation(productDir);
  const escapeFilePath = `${isolation.writableProductDir}-escape.txt`;
  const result = await runIsolatedNodeEntry(productDir, isolation, ["-e", ESCAPE_WRITE_PROBE_SCRIPT], {
    [SPEC_CLI_ISOLATION.ESCAPE_PROBE_PATH_ENV]: escapeFilePath,
  });
  let escapeFileExists = true;
  try {
    await readFile(escapeFilePath);
  } catch {
    escapeFileExists = false;
  }
  return { escapeFileExists, escapeFilePath, result };
}

/**
 * The exact methodology version every context fixture declares, drawn once
 * from the accepted-form generator with the line its construction derives.
 */
export const METHODOLOGY_FIXTURE_IDENTITY: GeneratedMethodologyVersion = sampleGeneratedValue(
  arbitraryMethodologyVersion(),
);
export const METHODOLOGY_FIXTURE_VERSION = METHODOLOGY_FIXTURE_IDENTITY.text;

export function specTreeKindsConfig(): Config {
  return {
    [SPEC_TREE_CONFIG.SECTION]: {
      [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY,
    },
    // A context projection stamps the product's methodology identity, which a
    // product declares rather than inherits, so every context fixture declares one.
    [METHODOLOGY_SECTION]: {
      [METHODOLOGY_CONFIG_FIELDS.VERSION]: METHODOLOGY_FIXTURE_VERSION,
    },
  };
}

/** The tree-rooted form of a node id or tree-relative artifact path, projected from the grammar. */
export function rootedSpecPath(relativePath: string): string {
  return `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}${relativePath}`;
}

/** A node's spec file under the tree root, in the prior `{slug}.md` form the fixture materializes. */
function specFilePath(directory: string, slug: string): string {
  return rootedSpecPath(
    [directory, `${slug}${SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX}`].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
  );
}

/** A decision file under the tree root or under `directory`, named by order, slug, and kind suffix. */
function decisionFilePath(directory: string | undefined, order: number, slug: string, suffix: string): string {
  const filename = `${order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slug}${suffix}`;
  return rootedSpecPath(
    directory === undefined ? filename : [directory, filename].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
  );
}

/** A file under the tree root at `directory`, or at the root when `directory` is undefined. */
function rootedArtifactPath(directory: string | undefined, filename: string): string {
  return rootedSpecPath(
    directory === undefined ? filename : [directory, filename].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
  );
}

export function readPaths(manifest: SpecContextManifest): readonly string[] {
  return manifest.read.map((document) => document.path);
}

export function listedPaths(manifest: SpecContextManifest): readonly string[] {
  return manifest.listed.map((entry) => entry.path);
}

export function allManifestPaths(manifest: SpecContextManifest): readonly string[] {
  return [...readPaths(manifest), ...listedPaths(manifest)];
}

/** Read-document paths carrying `role` for any target, in manifest order. */
export function readPathsForRole(manifest: SpecContextManifest, role: SpecContextReadRole): readonly string[] {
  return manifest.read
    .filter((document) => document.roles.some((binding) => binding.role === role))
    .map((document) => document.path);
}

/** Listed-entry paths carrying `role` for any target, in manifest order. */
export function listedPathsForRole(manifest: SpecContextManifest, role: SpecContextListedRole): readonly string[] {
  return manifest.listed
    .filter((entry) => entry.roles.some((binding) => binding.role === role))
    .map((entry) => entry.path);
}

/**
 * A name pair whose code-unit order is the opposite of its locale order,
 * proven by an in-process divergence check: distinct leading letters — never
 * a case-only difference, which collides on case-insensitive filesystems —
 * where "Z" precedes "a" by code units while locale collation orders "a"
 * before "Z". Shared by every ordering assertion so a locale-aware comparator
 * at any manifest ordering site fails a test instead of varying by host.
 */
export function divergentOrderSlugPair(): { readonly codeUnitFirst: string; readonly localeFirst: string } {
  const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
  const codeUnitFirst = `Z${slug}`;
  const localeFirst = `a${slug}`;
  if (!(codeUnitFirst < localeFirst) || codeUnitFirst.localeCompare(localeFirst) <= 0) {
    throw new Error("Expected a slug pair whose code-unit order diverges from its locale order");
  }
  return { codeUnitFirst, localeFirst };
}

/** Paths for the fully populated context fixture `withRichContextEnv` materializes. */
export interface RichContextPaths {
  readonly targetId: string;
  /** A node one level below the target, past the targetless walk's depth bound. */
  readonly deepDescendantId: string;
  readonly deepDescendantSpecPath: string;
  /** An eval artifact and a probe protocol under the target, beside its tests. */
  readonly targetEvalPath: string;
  readonly targetProbePath: string;
  readonly rootDirectory: string;
  readonly productPath: string;
  readonly rootSpecPath: string;
  readonly targetSpecPath: string;
  readonly ancestorDecisionPath: string;
  readonly higherAncestorDecisionPath: string;
  readonly higherProductDecisionPath: string;
  readonly lowerSiblingSpecPath: string;
  readonly citedDecisionPath: string;
  readonly transitiveCitedDecisionPath: string;
  readonly evidencePath: string;
  readonly rootPlanPath: string;
  readonly rootIssuesPath: string;
  readonly ancestorPlanPath: string;
  readonly targetIssuesPath: string;
  /**
   * Exact text written to the target ISSUES note; carries a leading byte-order
   * mark and multi-byte UTF-8 so BOM stripping or a wrong-encoding decode is
   * caught.
   */
  readonly targetIssuesText: string;
  /** The note's heading line without the byte-order mark: the text a leak of the note's body would carry. */
  readonly targetIssuesHeading: string;
  readonly rootGuidePaths: readonly string[];
  readonly ancestorGuidePath: string;
  readonly lifecycleOverlayPath: string;
  readonly listedOverlayPath: string;
  readonly sameIndexSiblingPath: string;
  readonly sameIndexSiblingSpecPath: string;
  readonly higherIndexSiblingPath: string;
  readonly higherIndexSiblingSpecPath: string;
  readonly peerDecisionPath: string;
  /** The nested target's outcome record, selected in Full only for an explicit target. */
  readonly targetOutcomePath: string;
  /** Knowledge indexes at the product root and the nested target, referenced only for explicit targets. */
  readonly rootKnowledgeIndexPath: string;
  readonly targetKnowledgeIndexPath: string;
  /** Exact source text of the documents the `show` projection selects, keyed by path. */
  readonly sourceText: Readonly<Record<string, string>>;
  /** The source text after its front matter — the Full content — for the documents that carry front matter. */
  readonly bodyText: Readonly<Record<string, string>>;
  /** The front-matter selection the target spec projects: its one selected key and drawn value. */
  readonly targetSelectedMetadata: Readonly<Record<string, string>>;
  /** The opening paragraph each Digest-selectable document carries, keyed by path. */
  readonly openingText: Readonly<Record<string, string>>;
}

function inlineCitation(path: string): string {
  return `[${parse(path).name}](${path})`;
}

/**
 * Materializes the fixture and writes `body` as the product spec and the
 * first decision, returning both paths; the caller owns the body it supplies.
 */
export async function writeProductAndDecisionBody(
  env: CurrentSpecTreeEnv,
  body: string,
): Promise<{ readonly productPath: string; readonly decisionPath: string }> {
  await env.materialize();
  const snapshot = await env.readFilesystemSnapshot();
  const productPath = snapshot.product?.ref?.path;
  const decisionPath = snapshot.decisions[0]?.ref?.path;
  if (productPath === undefined || decisionPath === undefined) {
    throw new Error("Expected the fixture to expose a product spec and a decision");
  }
  await env.writeRaw(productPath, body);
  await env.writeRaw(decisionPath, body);
  return { productPath, decisionPath };
}

/** One opening paragraph as the Digest projection selects it: keyword, subject, and its closing line ending. */
export function openingParagraph(keyword: string, subject: string): string {
  return `${keyword} ${subject}\nSO THAT readers\nCAN find it\n`;
}

/**
 * Materializes a spec tree exercising every manifest role at once: nested
 * target with ancestor, decisions above and below the constraining order,
 * a lower-index sibling that also cites the shared decision (multi-citer
 * provenance), coordination notes at the product root, the ancestor, and the
 * target, runtime guides at the product root and along the node path, both
 * overlay classes, co-located evidence, and a transitive cited-decision chain
 * rooted in the target spec. The product-root PLAN note embeds a
 * citation-shaped path to a decision that does not exist, proving
 * coordination notes never bind citations. The root node directory is a
 * second resolvable target sharing the product spec, the root spec, and the
 * ancestor decision with the nested target, so multi-target composition
 * exercises real shared documents.
 */
export async function withRichContextEnv(
  callback: (env: CurrentSpecTreeEnv, paths: RichContextPaths) => Promise<void>,
): Promise<void> {
  await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
    await env.materialize();
    const fixture = env.fixture;
    const rootDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.root);
    const childDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.child);
    const peerDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.peer);
    const targetId = [rootDirectory, childDirectory].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
    // One level below the target, so the targetless walk's depth bound
    // excludes it while a targeted projection of the target includes it.
    const deepDescendantSlug = `${fixture.child.slug}-deep`;
    const deepDescendantDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, {
      ...fixture.child,
      slug: deepDescendantSlug,
    });
    const deepDescendantId = [targetId, deepDescendantDirectory].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
    const deepDescendantSpecPath = specFilePath(deepDescendantId, deepDescendantSlug);
    const evidenceSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const decisionSuffix = KIND_REGISTRY[fixture.decision.kind].suffix;
    const snapshot = await env.readFilesystemSnapshot();
    const productPath = snapshot.product?.ref?.path;
    if (productPath === undefined) {
      throw new Error("Expected the materialized fixture to expose a product spec path");
    }
    const rootSpecPath = specFilePath(rootDirectory, fixture.root.slug);
    const targetSpecPath = specFilePath(targetId, fixture.child.slug);
    const ancestorDecisionPath = decisionFilePath(
      rootDirectory,
      fixture.decision.order,
      fixture.decision.slug,
      decisionSuffix,
    );
    const higherAncestorDecisionPath = decisionFilePath(
      rootDirectory,
      fixture.peer.order,
      fixture.decision.slug,
      decisionSuffix,
    );
    const higherProductDecisionPath = decisionFilePath(
      undefined,
      fixture.peer.order,
      fixture.decision.slug,
      decisionSuffix,
    );
    const lowerSiblingSpecPath = specFilePath(lowerSiblingDirectoryName(fixture), fixture.root.slug);
    const citedDecisionPath = decisionFilePath(
      peerDirectory,
      fixture.decision.order,
      `${fixture.decision.slug}-cited`,
      decisionSuffix,
    );
    const transitiveCitedDecisionPath = decisionFilePath(
      peerDirectory,
      fixture.peer.order,
      `${fixture.decision.slug}-transitive`,
      decisionSuffix,
    );
    const sameIndexSiblingSpecPath = specFilePath(sameIndexSiblingDirectoryName(fixture), `${fixture.root.slug}-same`);
    const higherIndexSiblingSpecPath = specFilePath(peerDirectory, fixture.peer.slug);
    const peerDecisionPath = decisionFilePath(
      peerDirectory,
      fixture.decision.order,
      `${fixture.decision.slug}-peer`,
      decisionSuffix,
    );
    const targetOutcomePath = rootedSpecPath(
      [targetId, `${fixture.child.slug}${SPEC_CONTEXT_OPTIONAL_ARTIFACT.OUTCOME_SUFFIX}`].join(
        SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
      ),
    );
    const rootOpening = KIND_REGISTRY[fixture.root.kind].opening;
    const openingText: Record<string, string> = {
      [productPath]: openingParagraph(SPEC_CONTEXT_DOCUMENT_OPENING.PRODUCT, `${fixture.product.title} — Übersicht ✓`),
      [rootSpecPath]: openingParagraph(rootOpening, fixture.root.slug),
      [targetSpecPath]: openingParagraph(
        KIND_REGISTRY[fixture.child.kind].opening,
        `${fixture.child.slug} under ${inlineCitation(peerDecisionPath)}`,
      ),
      [lowerSiblingSpecPath]: openingParagraph(rootOpening, "lower sibling"),
      [sameIndexSiblingSpecPath]: openingParagraph(rootOpening, "same sibling"),
      [higherIndexSiblingSpecPath]: openingParagraph(KIND_REGISTRY[fixture.peer.kind].opening, fixture.peer.slug),
      [ancestorDecisionPath]: openingParagraph(SPEC_CONTEXT_DOCUMENT_OPENING.DECISION, "the ancestor subtree"),
      [higherAncestorDecisionPath]: openingParagraph(
        SPEC_CONTEXT_DOCUMENT_OPENING.DECISION,
        "higher ancestor siblings",
      ),
      [higherProductDecisionPath]: openingParagraph(SPEC_CONTEXT_DOCUMENT_OPENING.DECISION, "higher product siblings"),
      [citedDecisionPath]: openingParagraph(SPEC_CONTEXT_DOCUMENT_OPENING.DECISION, "the cited concern"),
      [transitiveCitedDecisionPath]: openingParagraph(SPEC_CONTEXT_DOCUMENT_OPENING.DECISION, "the transitive concern"),
      [peerDecisionPath]: openingParagraph(SPEC_CONTEXT_DOCUMENT_OPENING.DECISION, "the peer subtree"),
      [deepDescendantSpecPath]: openingParagraph(KIND_REGISTRY[fixture.child.kind].opening, deepDescendantSlug),
    };
    // The nested target, the lower sibling, and the cited decision carry
    // inline-link citations; the target's Digest opening cites the peer
    // decision so a Digest opening contributes a citation too.
    const bodyText: Record<string, string> = {
      [targetSpecPath]: `\n# ${fixture.child.slug}\n\n${openingText[targetSpecPath]}\nGoverned by ${
        inlineCitation(citedDecisionPath)
      }.\n`,
      [targetOutcomePath]: `\n# ${fixture.child.slug} outcome\n\nMoves a metric.\n`,
    };
    // The target's front matter carries the one selected key beside an
    // unselected one; both values are drawn, so the projection cannot pass
    // by echoing a fixed vocabulary.
    const targetSelectedMetadata = {
      [SPEC_CONTEXT_SELECTED_METADATA_KEY]: sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug()),
    };
    const unselectedKey = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const sourceText: Record<string, string> = {
      [productPath]: `# ${fixture.product.title}\n\n${openingText[productPath]}\nRoot guidance.\n`,
      [rootSpecPath]: `# ${fixture.root.slug}\n\n${openingText[rootSpecPath]}\n## Assertions\n\n- Root rule.\n`,
      [targetSpecPath]: `---\n${SPEC_CONTEXT_SELECTED_METADATA_KEY}: ${
        targetSelectedMetadata[SPEC_CONTEXT_SELECTED_METADATA_KEY]
      }\n${unselectedKey}: ignored\n---\n${bodyText[targetSpecPath]}`,
      [lowerSiblingSpecPath]: `# Lower sibling\n\n${openingText[lowerSiblingSpecPath]}\nAlso governed by ${
        inlineCitation(citedDecisionPath)
      }.\n`,
      [sameIndexSiblingSpecPath]: `# Same sibling\n\n${openingText[sameIndexSiblingSpecPath]}`,
      [higherIndexSiblingSpecPath]: `# ${fixture.peer.slug}\n\n${openingText[higherIndexSiblingSpecPath]}`,
      [deepDescendantSpecPath]: `# ${deepDescendantSlug}\n\n${openingText[deepDescendantSpecPath]}`,
      [ancestorDecisionPath]: `# Ancestor decision\n\n${openingText[ancestorDecisionPath]}\n## Rationale\n\nBecause.\n`,
      [higherAncestorDecisionPath]: `# Higher ancestor decision\n\n${openingText[higherAncestorDecisionPath]}`,
      [higherProductDecisionPath]: `# Higher product decision\n\n${openingText[higherProductDecisionPath]}`,
      [citedDecisionPath]: `# Cited decision\n\n${openingText[citedDecisionPath]}\nRefines ${
        inlineCitation(transitiveCitedDecisionPath)
      } and cites ${inlineCitation(citedDecisionPath)} itself.\n`,
      [transitiveCitedDecisionPath]: `# Transitive cited decision\n\n${openingText[transitiveCitedDecisionPath]}`,
      [peerDecisionPath]: `# Peer decision\n\n${openingText[peerDecisionPath]}`,
      [targetOutcomePath]: `---\nid: ${fixture.child.slug}\n---\n${bodyText[targetOutcomePath]}`,
    };

    const paths: RichContextPaths = {
      targetId,
      deepDescendantId,
      deepDescendantSpecPath,
      targetEvalPath: rootedArtifactPath(
        [targetId, SPEC_TREE_GRAMMAR.EVAL.DIRECTORY_NAME, evidenceSlug].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
        SPEC_TREE_GRAMMAR.EVAL.FILES[0],
      ),
      targetProbePath: rootedArtifactPath(
        [targetId, SPEC_TREE_GRAMMAR.PROBE.DIRECTORY_NAME, evidenceSlug].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
        SPEC_TREE_GRAMMAR.PROBE.PROTOCOL_FILENAME,
      ),
      rootDirectory,
      productPath,
      rootSpecPath,
      targetSpecPath,
      ancestorDecisionPath,
      higherAncestorDecisionPath,
      higherProductDecisionPath,
      lowerSiblingSpecPath,
      citedDecisionPath,
      transitiveCitedDecisionPath,
      evidencePath: rootedArtifactPath(
        [targetId, SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
        sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.evidenceFileName()),
      ),
      rootPlanPath: rootedArtifactPath(undefined, SPEC_TREE_GRAMMAR.COORDINATION_NOTE.PLAN),
      rootIssuesPath: rootedArtifactPath(undefined, SPEC_TREE_GRAMMAR.COORDINATION_NOTE.ISSUES),
      ancestorPlanPath: rootedArtifactPath(rootDirectory, SPEC_TREE_GRAMMAR.COORDINATION_NOTE.PLAN),
      targetIssuesPath: rootedArtifactPath(targetId, SPEC_TREE_GRAMMAR.COORDINATION_NOTE.ISSUES),
      targetIssuesText: `${BYTE_ORDER_MARK}${TARGET_ISSUES_HEADING}\n`,
      targetIssuesHeading: TARGET_ISSUES_HEADING,
      rootGuidePaths: SPEC_TREE_GRAMMAR.GUIDE_FILES.map((filename) => filename),
      ancestorGuidePath: rootedArtifactPath(rootDirectory, SPEC_TREE_GRAMMAR.GUIDE_FILES[0]),
      lifecycleOverlayPath: SPEC_CONTEXT_LIFECYCLE_OVERLAY_PATH,
      listedOverlayPath: rootedArtifactPath(
        SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.DIRECTORY_NAME,
        `${
          sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug())
        }${SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.EXTENSION}`,
      ),
      sameIndexSiblingPath: rootedSpecPath(sameIndexSiblingDirectoryName(env.fixture)),
      sameIndexSiblingSpecPath,
      higherIndexSiblingPath: rootedSpecPath(peerDirectory),
      higherIndexSiblingSpecPath,
      peerDecisionPath,
      targetOutcomePath,
      rootKnowledgeIndexPath: rootedArtifactPath(undefined, SPEC_CONTEXT_OPTIONAL_ARTIFACT.KNOWLEDGE_INDEX),
      targetKnowledgeIndexPath: rootedArtifactPath(targetId, SPEC_CONTEXT_OPTIONAL_ARTIFACT.KNOWLEDGE_INDEX),
      sourceText,
      bodyText,
      targetSelectedMetadata,
      openingText,
    };

    for (const [path, text] of Object.entries(paths.sourceText)) await env.writeRaw(path, text);
    await env.writeRaw(paths.evidencePath, "import { describe, it } from \"vitest\";\n");
    await env.writeRaw(paths.rootPlanPath, "# Plan\n\nMentions spx/99-unscanned.pdr.md without binding it.\n");
    await env.writeRaw(paths.rootIssuesPath, "# Issues\n");
    await env.writeRaw(paths.ancestorPlanPath, "# Ancestor plan\n");
    await env.writeRaw(paths.targetIssuesPath, paths.targetIssuesText);
    for (const guidePath of paths.rootGuidePaths) {
      await env.writeRaw(guidePath, "# Guide\n");
    }
    await env.writeRaw(paths.ancestorGuidePath, "# Ancestor guide\n");
    await env.writeRaw(paths.lifecycleOverlayPath, "# Lifecycle overlay\n");
    await env.writeRaw(paths.listedOverlayPath, "# Listed overlay\n");
    await env.writeRaw(paths.rootKnowledgeIndexPath, "# Root knowledge\n");
    await env.writeRaw(paths.targetKnowledgeIndexPath, "# Target knowledge\n");

    await callback(env, paths);
  });
}

/** Filename of the escape-target fixture a containment scenario writes outside the probed boundary. */
export const SPEC_CONTEXT_ESCAPE_TARGET_FILENAME = "outside-secret.md";

/** UTF-8 byte-order mark: the fixture leads with it so BOM stripping or a wrong-encoding decode is caught. */
const BYTE_ORDER_MARK = "\uFEFF";
/** Multi-byte UTF-8 heading of the target's ISSUES note; a wrong-encoding decode mangles it. */
const TARGET_ISSUES_HEADING = "# Target issues — Prüfung ✓ 文脈";

const OUTSIDE_PRODUCT_DIRECTORY_PREFIX = "spx-context-outside-";

/**
 * A directory outside every product directory, removed after the callback,
 * for the containment cases that point an operand or a symbolic link past
 * the product root.
 */
export function withOutsideProductDir<T>(callback: (outsideDir: string) => Promise<T>): Promise<T> {
  return withTempDir(OUTSIDE_PRODUCT_DIRECTORY_PREFIX, callback);
}

/** The materialized shipped-tree fixture: locations and exact resource text. */
export interface MethodologyTreeFixture {
  /** Absolute path of the directory standing in for spx's `methodology/` directory. */
  readonly treeRoot: string;
  /** The line the fixture tree serves, derived from the declared fixture version. */
  readonly line: string;
  /** The coding agent the fixture tree belongs to. */
  readonly codingAgent: string;
  /** Absolute path of the fixture tree. */
  readonly treeDir: string;
  /** Absolute path of the written manifest file. */
  readonly manifestPath: string;
  /** Plugin-relative path of the core foundation document. */
  readonly corePath: string;
  /** Exact text written to the core foundation document; multi-byte content catches decode defects. */
  readonly coreText: string;
  /** Plugin-relative catalog paths in manifest order: references, templates, examples. */
  readonly catalogPaths: readonly string[];
  /** The package-root-relative bundle address followed by the core value: the path `show` frames the foundation under. */
  readonly documentPath: string;
}

export const METHODOLOGY_FIXTURE_CODING_AGENT = METHODOLOGY_CODING_AGENT.CLAUDE;
/** Product-relative directory standing in for the spx package the tree ships in; never part of the product's own tree. */
const PACKAGE_FIXTURE_DIRECTORY = "spx-package";

/** The config sections a shipped-tree test passes to `withSpecTreeEnv`. */
export function methodologyTreeConfig(identity?: Record<string, unknown>): Config {
  const base = specTreeKindsConfig();
  return {
    ...base,
    [METHODOLOGY_SECTION]: {
      ...(base[METHODOLOGY_SECTION] as Record<string, unknown>),
      ...identity,
    },
  };
}

/** The tree root a shipped-tree test injects: a package stand-in beside the product, holding `methodology/`. */
export function methodologyFixtureTreeRoot(env: CurrentSpecTreeEnv): string {
  return join(env.productDir, PACKAGE_FIXTURE_DIRECTORY, METHODOLOGY_TREE_ROOT);
}

/**
 * Writes a schema-version-1 foundation-resource manifest and its named
 * resources under the fixture tree root, addressed by the line of the version
 * the `methodologyTreeConfig` sections declare and the fixture coding agent.
 * `coreText` overrides the core body so a test can prove output tracks the
 * shipped resource bytes.
 */
export async function writeMethodologyTree(
  env: CurrentSpecTreeEnv,
  overrides?: {
    readonly coreText?: string;
    readonly schemaVersion?: number;
    /** The declared version with the line its generator derived; the tree lands under that line. */
    readonly version?: GeneratedMethodologyVersion;
    /** The coding agents the line ships the same tree for; the fixture names the first. */
    readonly codingAgents?: readonly string[];
    /** A source record written beside the line, the shape the fetch records. */
    readonly sourceRecord?: MethodologySourceRecord;
  },
): Promise<MethodologyTreeFixture> {
  // The line comes from the generator's construction, never from the
  // production parser the tests judge, so a wrong parse cannot land the
  // fixture where production then finds it.
  const line = { value: (overrides?.version ?? METHODOLOGY_FIXTURE_IDENTITY).line };
  const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
  const corePath = `skills/${slug}/SKILL.md`;
  const referencePath = `skills/${slug}/references/${slug}-reference.md`;
  const templatePath = `skills/${slug}/templates/${slug}-template.md`;
  const examplePath = `skills/${slug}/examples/${slug}-example.md`;
  const coreText = overrides?.coreText ?? `# Foundation — Grundlagen ✓ 基盤 ${slug}\n`;
  const manifest = {
    [FOUNDATION_MANIFEST_FIELDS.SCHEMA_VERSION]: overrides?.schemaVersion ?? FOUNDATION_MANIFEST_SCHEMA_VERSION,
    [FOUNDATION_MANIFEST_FIELDS.CORE]: corePath,
    [FOUNDATION_MANIFEST_FIELDS.REFERENCES]: [referencePath],
    [FOUNDATION_MANIFEST_FIELDS.TEMPLATES]: [templatePath],
    [FOUNDATION_MANIFEST_FIELDS.EXAMPLES]: [examplePath],
  };
  const treeRoot = methodologyFixtureTreeRoot(env);
  const codingAgents = overrides?.codingAgents ?? [METHODOLOGY_FIXTURE_CODING_AGENT];
  const codingAgent = codingAgents.at(0);
  if (codingAgent === undefined) throw new Error("a methodology tree fixture names at least one coding agent");
  for (const agent of codingAgents) {
    const agentTreeDir = join(treeRoot, line.value, agent, FOUNDATION_PLUGIN_NAME);
    const agentManifestPath = join(agentTreeDir, FOUNDATION_MANIFEST_RELATIVE_PATH);
    await mkdir(join(agentManifestPath, ".."), { recursive: true });
    await writeFile(agentManifestPath, JSON.stringify(manifest));
    await mkdir(join(agentTreeDir, corePath, ".."), { recursive: true });
    await writeFile(join(agentTreeDir, corePath), coreText);
    for (const catalogPath of [referencePath, templatePath, examplePath]) {
      await mkdir(join(agentTreeDir, catalogPath, ".."), { recursive: true });
      await writeFile(join(agentTreeDir, catalogPath), `# Catalog resource\n`);
    }
  }
  if (overrides?.sourceRecord !== undefined) {
    await writeFile(
      join(treeRoot, line.value, SOURCE_RECORD_RELATIVE_PATH),
      formatMethodologySourceRecord(overrides.sourceRecord),
    );
  }
  const treeDir = join(treeRoot, line.value, codingAgent, FOUNDATION_PLUGIN_NAME);
  const manifestPath = join(treeDir, FOUNDATION_MANIFEST_RELATIVE_PATH);
  return {
    treeRoot,
    line: line.value,
    codingAgent,
    treeDir,
    manifestPath,
    corePath,
    coreText,
    catalogPaths: [referencePath, templatePath, examplePath],
    documentPath: [METHODOLOGY_TREE_ROOT, line.value, codingAgent, FOUNDATION_PLUGIN_NAME, corePath].join("/"),
  };
}
