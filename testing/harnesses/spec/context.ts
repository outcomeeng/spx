import { copyFile, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, parse } from "node:path";
import { pathToFileURL } from "node:url";

import { Command, CommanderError } from "commander";
import { execa } from "execa";
import { build } from "tsup";
import { z } from "zod";

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
  renderSpecContextEntriesJson,
  resolveContextShow,
  SPEC_CONTEXT_ENTRIES_KEY,
  type SpecContextEntriesDocument,
} from "@/commands/spec/context-show";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import type { Config } from "@/config/types";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { formatSpecContextTargetFailure, specDomain } from "@/interfaces/cli/spec";
import { GIT_LS_FILES_COMMAND } from "@/lib/git/changed-paths";
import { GIT_ROOT_COMMAND } from "@/lib/git/root";
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
  SPEC_CONTEXT_ENTRY_TYPE,
  SPEC_CONTEXT_MODE_NAME,
  SPEC_CONTEXT_SELECTION_REASON,
  SPEC_TREE_CONFIG,
  SPEC_TREE_CONFIG_FIELDS,
  type SpecContextDocumentEntry,
  type SpecContextEntry,
  type SpecContextManifest,
  type SpecContextManifestEntry,
  type SpecContextSelectionReason,
} from "@/lib/spec-tree";
import type { GeneratedMethodologyVersion } from "@testing/generators/methodology/tree";
import { specContextFixtureDocuments, specContextRootDecisionPath } from "@testing/generators/spec-tree/context-target";
import {
  type RichContextPaths,
  type RichContextScenario,
  sampleRichContextScenario,
} from "@testing/generators/spec-tree/rich-context";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { CLI_PATH, NODE_EXECUTABLE, PRODUCT_ROOT } from "@testing/harnesses/constants";
import { GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { type CurrentSpecTreeEnv, withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { SPEC_CLI_ISOLATION } from "@testing/harnesses/spec/spec-cli-isolation-contract";
import { SPEC_CLI_NETWORK_GUARD_SOURCE_PATH } from "@testing/harnesses/spec/spec-cli-network-guard";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

/*
 * Readers for the two `spx spec context` JSON documents. Each schema draws its
 * closed vocabulary from the production registries and is checked against the
 * production type, so a document that does not carry the declared shape fails
 * at the read with the offending field instead of reaching an assertion
 * mistyped.
 */
const contextTargetSelectionSchema = z.strictObject({
  target: z.string(),
  reason: z.enum(Object.values(SPEC_CONTEXT_SELECTION_REASON)),
});

const contextManifestSchema = z.strictObject({
  schemaVersion: z.number().int(),
  bootstrap: z.boolean(),
  methodology: z.strictObject({
    source: z.string(),
    version: z.string().optional(),
    migratingFrom: z.string().optional(),
  }),
  entries: z.array(z.strictObject({
    path: z.string(),
    mode: z.enum(Object.values(SPEC_CONTEXT_MODE_NAME)),
    selections: z.array(contextTargetSelectionSchema),
    citedBy: z.array(z.string()).optional(),
  })),
}) satisfies z.ZodType<SpecContextManifest>;

const contextEntriesSchema = z.strictObject({
  [SPEC_CONTEXT_ENTRIES_KEY]: z.array(z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal(SPEC_CONTEXT_ENTRY_TYPE.REFERENCE), path: z.string() }),
    z.strictObject({
      type: z.literal(SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT),
      path: z.string(),
      metadata: z.record(z.string(), z.unknown()),
      content: z.string(),
    }),
  ])),
}) satisfies z.ZodType<SpecContextEntriesDocument>;

/** The manifest of a `list --json` document, validated against the declared manifest shape. */
export function parseContextManifest(output: string): SpecContextManifest {
  return contextManifestSchema.parse(JSON.parse(output));
}

/** The entry list of a `show --json` document, validated against the declared entry shapes. */
export function parseContextEntries(output: string): readonly SpecContextEntry[] {
  return contextEntriesSchema.parse(JSON.parse(output))[SPEC_CONTEXT_ENTRIES_KEY];
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

/** Everything one in-process run of the spec descriptor wrote, for the test to judge. */
export interface SpecDescriptorRun {
  /** Every byte the invocation wrote to standard output — composed and relayed alike — in write order. */
  readonly stdout: string;
  readonly stderr: string;
  /** The exit code the invocation set or exited with; `undefined` when it set none. */
  readonly exitCode: number | undefined;
  /** The Commander error that ended the parse before any handler ran, if one did. */
  readonly parseError: CommanderError | undefined;
}

/** The descriptor's own exit request, raised so a handler that exits stops where the process would. */
class SpecDescriptorExit extends Error {
  constructor(readonly exitCode: number) {
    super(`The spec descriptor exited with ${exitCode}`);
  }
}

/** The directories one descriptor run resolves against; the invocation directory defaults to the product root. */
export interface SpecDescriptorContext {
  readonly productDir: string;
  readonly invocationDir?: string;
  readonly methodologyTreeRoot?: string;
}

function createSpecDescriptorProgram(
  context: SpecDescriptorContext,
  record: { stdout: (output: string) => void; stderr: (output: string) => void; exitCode: (code: number) => void },
): Command {
  const program = new Command().exitOverride().configureOutput({ writeOut: record.stdout, writeErr: record.stderr });
  const invocationDir = context.invocationDir ?? context.productDir;
  specDomain.register(program, {
    io: {
      writeStdout: record.stdout,
      writeStderr: record.stderr,
      writePassThrough: record.stdout,
      writePassThroughError: record.stderr,
      setExitCode: record.exitCode,
      exit: (exitCode: number): never => {
        throw new SpecDescriptorExit(exitCode);
      },
    },
    ...(context.methodologyTreeRoot === undefined ? {} : { methodologyTreeRoot: context.methodologyTreeRoot }),
    resolveEffectiveInvocationDir: () => invocationDir,
    resolveProductContext: () => ({ effectiveInvocationDir: invocationDir, productDir: context.productDir }),
  });
  return program;
}

/**
 * Runs `argv` through the real spec descriptor registered on a fresh
 * Commander program, with recording streams in place of the process streams.
 * The descriptor, its option surface, and the handlers it calls all run for
 * real; only the process boundary is replaced by observations.
 */
export async function runSpecDescriptor(
  context: SpecDescriptorContext,
  ...argv: readonly string[]
): Promise<SpecDescriptorRun> {
  let stdout = "";
  let stderr = "";
  let exitCode: number | undefined;
  let parseError: CommanderError | undefined;
  const program = createSpecDescriptorProgram(context, {
    stdout: (output) => {
      stdout += output;
    },
    stderr: (output) => {
      stderr += output;
    },
    exitCode: (code) => {
      exitCode = code;
    },
  });
  try {
    await program.parseAsync([...argv], { from: SPX_COMMANDER_PARSE_SOURCE });
  } catch (error: unknown) {
    if (error instanceof SpecDescriptorExit) exitCode = error.exitCode;
    else if (error instanceof CommanderError) {
      parseError = error;
      exitCode = error.exitCode;
    } else throw error;
  }
  return { stdout, stderr, exitCode, parseError };
}

/**
 * The long option flags the real spec descriptor registers on the command
 * reached by `commandPath` — command words in invocation order — in
 * declaration order. The test owns every predicate over them.
 */
export function specDescriptorOptionFlags(commandPath: readonly string[]): readonly string[] {
  const noop = (): void => undefined;
  const program = createSpecDescriptorProgram({ productDir: process.cwd() }, {
    stdout: noop,
    stderr: noop,
    exitCode: noop,
  });
  const command = commandPath.reduce<Command | undefined>(
    (parent, name) => parent?.commands.find((child) => child.name() === name),
    program,
  );
  if (command === undefined) {
    throw new Error(`Expected the spec descriptor to register ${commandPath.join(" ")}`);
  }
  return command.options.flatMap((option) => option.long === undefined ? [] : [option.long]);
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

/**
 * The bundled guard module text, built once per test process. The guard
 * source does not change while a test process runs, so rebuilding it for every
 * isolated invocation only repeats a bundler run per CLI call; each isolation
 * directory still receives its own copy of the identical module.
 */
let specCliNetworkGuardBundle: Promise<string> | undefined;

async function bundleSpecCliNetworkGuard(isolationDir: string): Promise<string> {
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
  return readFile(join(isolationDir, SPEC_CLI_ISOLATION.NETWORK_GUARD_MODULE), "utf8");
}

async function buildSpecCliNetworkGuard(isolationDir: string): Promise<string> {
  const modulePath = join(isolationDir, SPEC_CLI_ISOLATION.NETWORK_GUARD_MODULE);
  if (specCliNetworkGuardBundle === undefined) {
    const bundle = bundleSpecCliNetworkGuard(isolationDir);
    specCliNetworkGuardBundle = bundle;
    try {
      await bundle;
    } catch (error) {
      specCliNetworkGuardBundle = undefined;
      throw error;
    }
  } else {
    await writeFile(modulePath, await specCliNetworkGuardBundle);
  }
  return pathToFileURL(modulePath).href;
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

const SPEC_CLI_PRODUCT_CONFIG_FIXTURE_ROOT = join(PRODUCT_ROOT, "testing/fixtures/spec-cli/retired-apply-product");

/**
 * Copies the named product-root files of the inert product-configuration
 * fixture into the temp product directory, so a process-level run meets real
 * package, Python, and TypeScript manifests beside the spx configuration the
 * spec-tree environment already wrote.
 */
export async function installSpecCliProductConfigFixture(
  productDir: string,
  fileNames: readonly string[],
): Promise<void> {
  await Promise.all(
    fileNames.map((fileName) =>
      copyFile(join(SPEC_CLI_PRODUCT_CONFIG_FIXTURE_ROOT, fileName), join(productDir, fileName))
    ),
  );
}

/**
 * The exact methodology version every context fixture declares: the 3.x line
 * that the context-ingestion evidence settles on, with its line spelled out
 * rather than derived by the parser the tests judge.
 */
export const METHODOLOGY_FIXTURE_IDENTITY: GeneratedMethodologyVersion = {
  text: "3.2.0",
  line: "3.2",
};
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

/** Every manifest entry's path, in manifest order. */
export function allManifestPaths(manifest: SpecContextManifest): readonly string[] {
  return manifest.entries.map((entry) => entry.path);
}

/** The manifest entry at `path`, or none when the manifest carries no entry there. */
export function manifestEntryAt(
  manifest: SpecContextManifest,
  path: string,
): SpecContextManifestEntry | undefined {
  return manifest.entries.find((entry) => entry.path === path);
}

/** Paths of the entries any requested target selects for `reason`, in manifest order. */
export function manifestPathsForReason(
  manifest: SpecContextManifest,
  reason: SpecContextSelectionReason,
): readonly string[] {
  return manifest.entries
    .filter((entry) => entry.selections.some((selection) => selection.reason === reason))
    .map((entry) => entry.path);
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

/**
 * Materializes a generated rich-context scenario — the representative fixture
 * plus every file the scenario declares — and hands the callback the
 * environment and the scenario's paths. The scenario is pure generated data;
 * this harness owns only its materialization and the temp-directory lifecycle.
 */
export async function withRichContextEnv(
  callback: (env: CurrentSpecTreeEnv, paths: RichContextPaths) => Promise<void>,
  scenario: RichContextScenario = sampleRichContextScenario(),
): Promise<void> {
  await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
    await env.materialize();
    const snapshot = await env.readFilesystemSnapshot();
    if (snapshot.product?.ref?.path !== scenario.paths.productPath) {
      throw new Error("Expected the materialized fixture to expose the scenario's product spec path");
    }
    for (const [path, text] of Object.entries(scenario.files)) await env.writeRaw(path, text);
    await callback(env, scenario.paths);
  }, { fixture: scenario.fixture });
}

/**
 * Hands the callback an environment whose `spx/` directory exists and holds
 * nothing: no product spec, no node, and no decision. The callback receives
 * the environment unmaterialized; this harness owns only creating the empty
 * tree directory and confirming the snapshot sees none of the three.
 */
export async function withEmptyContextTreeEnv(
  config: Config,
  callback: (env: CurrentSpecTreeEnv) => Promise<void>,
): Promise<void> {
  await withSpecTreeEnv(config, async (env) => {
    await mkdir(join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY), { recursive: true });
    const snapshot = await env.readFilesystemSnapshot();
    if (snapshot.product?.ref !== undefined || snapshot.allNodes.length > 0 || snapshot.decisions.length > 0) {
      throw new Error("Expected the empty tree to expose no product spec, node, or decision");
    }
    await callback(env);
  });
}

/** The paths a product-spec-less tree carries: the fixture's root node target and the product-root decision beside it. */
export interface ProductlessContextTreePaths {
  readonly nodeTargetPath: string;
  readonly rootDecisionPath: string;
}

/**
 * Hands the callback an environment whose `spx/` directory holds the
 * representative fixture's nodes and a product-root decision but no product
 * spec. The harness materializes the fixture, copies the fixture decision's
 * own text to the product-root decision path, removes the product spec, and
 * confirms the snapshot sees nodes and that root decision with no product
 * spec; the callback owns every predicate.
 */
export async function withProductlessContextTreeEnv(
  config: Config,
  callback: (env: CurrentSpecTreeEnv, paths: ProductlessContextTreePaths) => Promise<void>,
): Promise<void> {
  await withSpecTreeEnv(config, async (env) => {
    await env.materialize();
    const documents = specContextFixtureDocuments(env.fixture);
    const rootDecisionPath = specContextRootDecisionPath(env.fixture, env.fixture.decision.kind);
    await env.writeRaw(rootDecisionPath, await env.readFile(documents.nodeDecisionPath));
    await rm(join(env.productDir, documents.productSpecPath));
    const snapshot = await env.readFilesystemSnapshot();
    if (
      snapshot.product?.ref !== undefined || snapshot.allNodes.length === 0
      || !snapshot.decisions.some((decision) => decision.ref?.path === rootDecisionPath)
    ) {
      throw new Error("Expected the productless tree to expose nodes and a root decision with no product spec");
    }
    await callback(env, { nodeTargetPath: documents.rootTargetPath, rootDecisionPath });
  });
}

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
  /** Exact text written to the named coding agent's core foundation document; multi-byte content catches decode defects. */
  readonly coreText: string;
  /** Exact core text per coding agent the line ships; each agent's text is distinct unless `coreText` overrides it. */
  readonly coreTexts: Readonly<Record<string, string>>;
  /** Plugin-relative catalog paths in manifest order: references, templates, examples. */
  readonly catalogPaths: readonly string[];
  /** Exact text written to each catalog resource, keyed by its plugin-relative path. */
  readonly catalogTexts: Readonly<Record<string, string>>;
  /** Absolute path of the directory standing in for spx's package root, which holds `treeRoot`. */
  readonly packageRoot: string;
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
    /** The generated slug naming the fixture's skill resources; drawn when the caller supplies none. */
    readonly slug?: string;
  },
): Promise<MethodologyTreeFixture> {
  // The line comes from the generator's construction, never from the
  // production parser the tests judge, so a wrong parse cannot land the
  // fixture where production then finds it.
  const line = { value: (overrides?.version ?? METHODOLOGY_FIXTURE_IDENTITY).line };
  const slug = overrides?.slug ?? sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
  const corePath = `skills/${slug}/SKILL.md`;
  const referencePath = `skills/${slug}/references/${slug}-reference.md`;
  const templatePath = `skills/${slug}/templates/${slug}-template.md`;
  const examplePath = `skills/${slug}/examples/${slug}-example.md`;
  const baseCoreText = `# Foundation — Grundlagen ✓ 基盤 ${slug}\n`;
  const manifest = {
    [FOUNDATION_MANIFEST_FIELDS.SCHEMA_VERSION]: overrides?.schemaVersion ?? FOUNDATION_MANIFEST_SCHEMA_VERSION,
    [FOUNDATION_MANIFEST_FIELDS.CORE]: corePath,
    [FOUNDATION_MANIFEST_FIELDS.REFERENCES]: [referencePath],
    [FOUNDATION_MANIFEST_FIELDS.TEMPLATES]: [templatePath],
    [FOUNDATION_MANIFEST_FIELDS.EXAMPLES]: [examplePath],
  };
  const catalogPaths = [referencePath, templatePath, examplePath];
  const catalogTexts = Object.fromEntries(catalogPaths.map((path) => [path, `# Catalog resource ${path}\n`]));
  const treeRoot = methodologyFixtureTreeRoot(env);
  const codingAgents = overrides?.codingAgents ?? [METHODOLOGY_FIXTURE_CODING_AGENT];
  const codingAgent = codingAgents.at(0);
  if (codingAgent === undefined) throw new Error("a methodology tree fixture names at least one coding agent");
  const coreTexts = Object.fromEntries(
    codingAgents.map((agent) => [agent, overrides?.coreText ?? `${baseCoreText}${agent}\n`]),
  );
  for (const agent of codingAgents) {
    const agentTreeDir = join(treeRoot, line.value, agent, FOUNDATION_PLUGIN_NAME);
    const agentManifestPath = join(agentTreeDir, FOUNDATION_MANIFEST_RELATIVE_PATH);
    await mkdir(join(agentManifestPath, ".."), { recursive: true });
    await writeFile(agentManifestPath, JSON.stringify(manifest));
    await mkdir(join(agentTreeDir, corePath, ".."), { recursive: true });
    await writeFile(join(agentTreeDir, corePath), coreTexts[agent] ?? baseCoreText);
    for (const catalogPath of catalogPaths) {
      await mkdir(join(agentTreeDir, catalogPath, ".."), { recursive: true });
      await writeFile(join(agentTreeDir, catalogPath), catalogTexts[catalogPath] ?? "");
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
    coreText: coreTexts[codingAgent] ?? baseCoreText,
    coreTexts,
    catalogTexts,
    packageRoot: dirname(treeRoot),
    catalogPaths,
  };
}
