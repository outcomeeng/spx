/**
 * Journal-streaming test run: producer types, the evidence-sink port, and the
 * product-resolved Vitest run starter.
 *
 * The custom Vitest reporter translates per-module and per-case lifecycle events
 * into these producer values and forwards them to an injected TestRunEvidenceSink.
 * The verification executor supplies a sink backed by the recorder's evidence-append
 * ports; tests supply a recording sink. The reporter constructs no journal events
 * and performs no I/O — every durable effect flows through the sink.
 *
 * The runner belongs to the product under test: the run starter resolves the Vitest
 * Node API against the product directory through an injected loader and imports the
 * module that resolution names, so a globally installed harness starts the product's
 * own Vitest and a product without one yields an unresolved outcome instead of a run.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import type { Reporter, TestCase, TestModule, TestRunEndReason } from "vitest/node";

import {
  READ_RECORDER_META_KEY,
  READ_RECORDER_SETUP_FILE,
  READ_RECORDER_VITEST_ENTRY_ENV,
} from "@/test/languages/read-recorder";
import {
  JOURNAL_RUN_TERMINAL_STATUS,
  type JournalRunRequest,
  type JournalRunTerminalStatus,
  type TestRunEvidenceSink,
} from "@/test/languages/types";

/** The package the journal-streaming run resolves from the product under test. */
export const VITEST_PACKAGE_NAME = "vitest";
/** The Vitest package entry exposing the Node API. */
export const VITEST_NODE_API_ENTRY = "node";
/** The Vitest run mode a journal-streaming run starts. */
export const VITEST_RUN_MODE = "test";

/** The directory a product's installed packages resolve from, at the product directory or an ancestor. */
const PACKAGE_DEPENDENCIES_DIRECTORY = "node_modules";
/** The manifest a package declares its entry points in; resolution is anchored at the product's Vitest manifest. */
const PACKAGE_MANIFEST_FILENAME = "package.json";

/** The `exports` subpath under which a Vitest package maps its main entry, the module a test file imports. */
const MAIN_EXPORT_SUBPATH = ".";
/** The `exports` subpath under which a Vitest package maps its Node API entry. */
const NODE_API_EXPORT_SUBPATH = `./${VITEST_NODE_API_ENTRY}`;
/** The manifest field declaring a package's entry points. */
const MANIFEST_EXPORTS_FIELD = "exports";
/**
 * The export conditions the run resolves under — those of an ESM import: the run loads the
 * entry with `import()`, so a target reachable only under `require` is not one it can load,
 * and a target declared under `import` only is. Precedence among matching conditions is the
 * manifest's own key order, as in Node.
 */
const IMPORT_RESOLUTION_CONDITIONS: ReadonlySet<string> = new Set(["import", "node", "default"]);
/** The wildcard a pattern export key and its target carry, standing for the matched subpath segment. */
const EXPORT_PATTERN_WILDCARD = "*";

/** The directory segment under which installed dependencies live; a path through it is never a product file. */
export const DEPENDENCIES_SEGMENT = "node_modules";
/** The separator of the product-relative paths a scope carries, independent of the host platform. */
export const PRODUCT_PATH_SEPARATOR = "/";
/** The parent-directory segment a relative path starts with when it leaves the root it is relative to. */
export const PARENT_SEGMENT = "..";
/**
 * The dependency lockfiles a product root may hold, in the order the run prefers them: the first
 * one present is the product's dependency lockfile.
 */
export const LOCKFILE_NAMES = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", "bun.lockb"] as const;
/**
 * The import-diagnostic collection limit of a journal-streaming run: Vitest records the import
 * diagnostic of a module only up to this many imports, so the limit is lifted to cover every import.
 */
export const IMPORT_DIAGNOSTIC_LIMIT = Number.MAX_SAFE_INTEGER;

/** The slice of the Vitest Node API a journal-streaming run drives. */
export type VitestNodeApi = Pick<typeof import("vitest/node"), "startVitest">;

/** Where the Vitest Node API resolved to against a product directory, or that the directory supplies none. */
export type VitestNodeApiResolution =
  | {
    readonly resolved: true;
    /** The module specifier resolution produced, the one the run imports. */
    readonly specifier: string;
  }
  | {
    readonly resolved: false;
    /** The product directory searched for the Node API. */
    readonly productDir: string;
  };

/**
 * Resolves and imports the Vitest Node API against a product directory. Production resolves
 * through Node's module resolution anchored at the product directory and imports the resolved
 * module; `l1` tests inject a deterministic loader and inspect the specifier the starter asks for.
 */
export interface VitestNodeApiLoader {
  /** Resolves the Node API specifier against the product directory under test. */
  resolve(productDir: string): VitestNodeApiResolution;
  /** Imports the module a resolution named. */
  load(specifier: string): Promise<VitestNodeApi>;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolves one `exports` target to its relative path under the import conditions: a string is
 * unconditional, and a conditions object takes its first key (in declaration order) among the
 * conditions the run resolves under, recursing into nested conditions. A target no condition
 * reaches resolves to nothing.
 */
function resolveExportTarget(target: unknown): string | undefined {
  if (typeof target === "string") return target;
  if (!isRecord(target)) return undefined;
  for (const [condition, candidate] of Object.entries(target)) {
    if (!IMPORT_RESOLUTION_CONDITIONS.has(condition)) continue;
    const resolved = resolveExportTarget(candidate);
    if (resolved !== undefined) return resolved;
  }
  return undefined;
}

/** A pattern export key that covers the Node API subpath: the target it maps and the segment its wildcard matched. */
interface PatternExportMatch {
  readonly prefixLength: number;
  readonly target: unknown;
  readonly matched: string;
}

/**
 * The pattern export key covering the Node API subpath, as Node matches one: a key carrying
 * exactly one wildcard whose prefix and suffix enclose the subpath, the longest prefix
 * winning among candidates. A literal key takes precedence and is looked up before this.
 */
function matchPatternExport(exports: Readonly<Record<string, unknown>>): PatternExportMatch | undefined {
  let best: PatternExportMatch | undefined;
  for (const [key, target] of Object.entries(exports)) {
    const wildcard = key.indexOf(EXPORT_PATTERN_WILDCARD);
    if (wildcard < 0 || key.includes(EXPORT_PATTERN_WILDCARD, wildcard + 1)) continue;
    const prefix = key.slice(0, wildcard);
    const suffix = key.slice(wildcard + 1);
    const covers = NODE_API_EXPORT_SUBPATH.length > prefix.length + suffix.length
      && NODE_API_EXPORT_SUBPATH.startsWith(prefix)
      && NODE_API_EXPORT_SUBPATH.endsWith(suffix);
    if (!covers || (best !== undefined && best.prefixLength >= prefix.length)) continue;
    best = {
      prefixLength: prefix.length,
      target,
      matched: NODE_API_EXPORT_SUBPATH.slice(prefix.length, NODE_API_EXPORT_SUBPATH.length - suffix.length),
    };
  }
  return best;
}

/**
 * The Node API entry file a package's manifest maps under the import conditions — through
 * the literal Node API subpath key, or a pattern key covering it — or nothing when the
 * manifest declares no such entry in its `exports` map. A manifest without an `exports` map
 * declares none: the adapter resolves the entry a package declares, not a legacy layout.
 */
function nodeApiEntryFromManifest(manifestText: string): string | undefined {
  const manifest: unknown = JSON.parse(manifestText);
  if (!isRecord(manifest)) return undefined;
  const exports = manifest[MANIFEST_EXPORTS_FIELD];
  if (!isRecord(exports)) return undefined;
  if (NODE_API_EXPORT_SUBPATH in exports) return resolveExportTarget(exports[NODE_API_EXPORT_SUBPATH]);
  const pattern = matchPatternExport(exports);
  if (pattern === undefined) return undefined;
  return resolveExportTarget(pattern.target)?.replaceAll(EXPORT_PATTERN_WILDCARD, pattern.matched);
}

/**
 * Locates the product's installed Vitest package: the first `node_modules/vitest` manifest found
 * walking from the product directory up through its ancestors — the hierarchy a product's own
 * install (or a workspace hoisting it) places the package in. Only that hierarchy is searched:
 * Node's ambient fallbacks (`NODE_PATH`, the global folders) are never consulted, so a
 * harness's own install never stands in for a product that has none.
 */
function findProductVitestPackageDir(productDir: string): string | undefined {
  let directory = resolve(productDir);
  for (;;) {
    const manifestPath = join(
      directory,
      PACKAGE_DEPENDENCIES_DIRECTORY,
      VITEST_PACKAGE_NAME,
      PACKAGE_MANIFEST_FILENAME,
    );
    if (existsSync(manifestPath)) return dirname(manifestPath);
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

/**
 * The production loader: it locates the product's Vitest package through the product
 * directory's own `node_modules` hierarchy, resolves the Node API entry from that package's
 * `exports` map under the same import conditions the run loads it with, and imports the
 * resolved file. Anchoring at the product keeps the version the product selected in force —
 * a bare specifier would resolve against the harness's own install instead — and resolving
 * under the import conditions keeps an entry the product exposes to `import()` resolvable
 * even when its manifest exposes none to `require()`. The entry is the one the manifest's
 * `exports` map declares for the Node API subpath, through its literal key or a pattern key
 * covering it. A package whose manifest declares no such entry — no `exports` map, no key
 * covering the subpath, or no target under those conditions — or maps it to a file that does
 * not exist, is a product without the runner; a manifest that cannot be parsed is an error
 * the caller sees.
 */
export const productVitestNodeApiLoader: VitestNodeApiLoader = {
  resolve(productDir: string): VitestNodeApiResolution {
    const packageDir = findProductVitestPackageDir(productDir);
    if (packageDir === undefined) return { resolved: false, productDir };
    const entryTarget = nodeApiEntryFromManifest(
      readFileSync(join(packageDir, PACKAGE_MANIFEST_FILENAME), "utf8"),
    );
    if (entryTarget === undefined) return { resolved: false, productDir };
    const entryPath = resolve(packageDir, entryTarget);
    if (!existsSync(entryPath)) return { resolved: false, productDir };
    return { resolved: true, specifier: realpathSync(entryPath) };
  },
  load(specifier: string): Promise<VitestNodeApi> {
    return import(pathToFileURL(specifier).href) as Promise<VitestNodeApi>;
  },
};

/** How a journal-streaming run starts Vitest: the scope to run and the reporters registered on it. */
export interface VitestRunStartOptions {
  /** Product directory the run executes against. */
  readonly productDir: string;
  /** Test file paths the run covers; empty runs the runner's full scope. */
  readonly testPaths: readonly string[];
  /** Reporters registered on the run — the journal reporter among them. */
  readonly reporters: readonly Reporter[];
  /** Setup files each test worker of the run executes — the read recorder among them. */
  readonly setupFiles: readonly string[];
  /** Environment variables each test worker of the run receives. */
  readonly workerEnv: Readonly<Record<string, string>>;
}

/** Whether a start ran Vitest, or found no Vitest Node API in the product directory searched. */
export type VitestRunStart =
  | { readonly started: true }
  | {
    readonly started: false;
    /** The product directory searched for the Node API. */
    readonly unresolvedProductDir: string;
  };

/**
 * Starts a programmatic Vitest run with the given reporters registered through the
 * Node API. Production wires the product-resolved `startVitest`; tests inject a spy
 * that records the options without spawning Vitest.
 */
export interface VitestRunStarter {
  start(options: VitestRunStartOptions): Promise<VitestRunStart>;
}

/** The Vitest case-result state the reporter records as a finding. */
const VITEST_FAILED_CASE_STATE = "failed";

/** The first sink append a reporter saw rejected, retained so the run can surface it once Vitest returns. */
export interface RetainedSinkFailure {
  readonly failure: unknown;
}

/**
 * A journal reporter: a Vitest reporter streaming scope and finding evidence, plus the terminal
 * status it captured and the first sink failure it observed.
 */
export interface JournalReporter extends Reporter {
  /** The terminal status captured from the run's end reason, or undefined before the run ends. */
  readonly terminalStatus: JournalRunTerminalStatus | undefined;
  /** The first sink append that rejected, or undefined while every append has succeeded. */
  readonly sinkFailure: RetainedSinkFailure | undefined;
}

function terminalStatusFromReason(reason: TestRunEndReason): JournalRunTerminalStatus {
  return (
    Object.values(JOURNAL_RUN_TERMINAL_STATUS).find((status) => status === reason)
      ?? JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED
  );
}

function findingErrorMessages(errors: ReadonlyArray<{ readonly message?: string }>): readonly string[] {
  return errors.map((error) => error.message ?? "");
}

/** What a journal reporter is handed when the run builds it. */
export interface JournalReporterOptions {
  /** The absolute path of the product's dependency lockfile, absent when the product root holds none. */
  readonly lockfilePath?: string;
  /**
   * The product root resolved through symbolic links, the form the run reports product files in;
   * absent, the root each module's project configuration names is used as it stands.
   */
  readonly realProductRoot?: string;
}

/** The product root resolved through symbolic links, the form the run reports product files in; the root itself when it does not resolve. */
export function realRootOf(productRoot: string): string {
  try {
    return realpathSync(productRoot);
  } catch {
    return productRoot;
  }
}

/** The files a module loaded from its import diagnostic, or nothing when the diagnostic is unavailable. */
function importedPathsOf(module: TestModule): readonly string[] | undefined {
  try {
    const durations: unknown = module.diagnostic().importDurations;
    return isRecord(durations) ? Object.keys(durations) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The product-relative form of an absolute path, or nothing when the path is not a product file:
 * a path outside the product root, the root itself, or a path through the installed dependencies.
 */
function productRelativePath(productRoot: string, absolutePath: string): string | undefined {
  if (!isAbsolute(absolutePath)) return undefined;
  const relativePath = relative(productRoot, absolutePath);
  if (relativePath === "" || isAbsolute(relativePath)) return undefined;
  const segments = relativePath.split(sep);
  if (segments[0] === PARENT_SEGMENT || segments.includes(DEPENDENCIES_SEGMENT)) return undefined;
  return segments.join(PRODUCT_PATH_SEPARATOR);
}

/** The absolute paths the read recorder left in a module's metadata, or none when it left no list. */
function openedPathsOf(meta: object): readonly string[] {
  const recorded: unknown = (meta as Readonly<Record<string, unknown>>)[READ_RECORDER_META_KEY];
  return Array.isArray(recorded) ? recorded.filter((entry): entry is string => typeof entry === "string") : [];
}

/**
 * The sorted unique product-relative paths a module read: the files it loaded, from its import
 * diagnostic, the files it opened, from its metadata, and the product's lockfile when it holds one.
 */
function moduleReadPaths(module: TestModule, options: JournalReporterOptions): readonly string[] {
  const { lockfilePath } = options;
  const productRoot = options.realProductRoot ?? module.project.config.root;
  const importedPaths = importedPathsOf(module);
  if (importedPaths === undefined) return [];
  const candidates = [
    ...importedPaths,
    ...openedPathsOf(module.meta()),
    ...(lockfilePath === undefined ? [] : [lockfilePath]),
  ];
  const relativePaths = new Set<string>();
  for (const candidate of candidates) {
    const relativePath = productRelativePath(productRoot, candidate);
    if (relativePath !== undefined) relativePaths.add(relativePath);
  }
  return [...relativePaths].sort((left, right) => left.localeCompare(right));
}

/**
 * Builds a journal reporter that forwards each Vitest lifecycle event to the sink as
 * it fires: a finished module records a scope carrying the product-relative paths it
 * read, a failing case records a finding, a passing case records nothing, and run end
 * captures the terminal status. Each hook awaits its sink append before returning, and
 * Vitest awaits the hook, so an async sink's write completes before the run advances to
 * the next hook or run end. A rejected append still rejects its hook, and the reporter
 * retains the first such failure: Vitest catches a rejecting hook into the run's own
 * error list rather than failing the run, so without the retained failure a lost append
 * would vanish behind the terminal status. Constructs no journal events and performs no
 * I/O — every durable effect flows through the sink.
 */
export function createJournalReporter(
  sink: TestRunEvidenceSink,
  options: JournalReporterOptions = {},
): JournalReporter {
  let terminalStatus: JournalRunTerminalStatus | undefined;
  let sinkFailure: RetainedSinkFailure | undefined;
  const forward = async (append: () => void | Promise<void>): Promise<void> => {
    try {
      await append();
    } catch (error: unknown) {
      sinkFailure ??= { failure: error };
      throw error;
    }
  };
  return {
    async onTestModuleEnd(module: TestModule): Promise<void> {
      const readPaths = moduleReadPaths(module, options);
      await forward(() =>
        sink.appendScope(
          readPaths.length === 0 ? { moduleId: module.moduleId } : { moduleId: module.moduleId, readPaths },
        )
      );
    },
    async onTestCaseResult(testCase: TestCase): Promise<void> {
      const result = testCase.result();
      if (result.state !== VITEST_FAILED_CASE_STATE) return;
      await forward(() =>
        sink.appendFinding({
          moduleId: testCase.module.moduleId,
          testName: testCase.fullName,
          errors: findingErrorMessages(result.errors),
        })
      );
    },
    onTestRunEnd(_modules, _errors, reason: TestRunEndReason): void {
      terminalStatus = terminalStatusFromReason(reason);
    },
    get terminalStatus(): JournalRunTerminalStatus | undefined {
      return terminalStatus;
    },
    get sinkFailure(): RetainedSinkFailure | undefined {
      return sinkFailure;
    },
  };
}

/**
 * The real absolute path of the product's dependency lockfile, or nothing when the product root
 * holds none. The path is resolved through symbolic links, the form the run reports every other
 * product file in, so it relates to the product root the same way.
 */
export function findProductLockfile(productDir: string): string | undefined {
  const present = LOCKFILE_NAMES.find((name) => existsSync(join(productDir, name)));
  return present === undefined ? undefined : realpathSync(join(productDir, present));
}

/**
 * The real absolute path of the Vitest module a test file of the product imports, resolved from
 * the product's own installed Vitest package under the import conditions, or nothing when the
 * product holds no such package or its manifest maps no existing main entry.
 */
export function findProductVitestEntry(productDir: string): string | undefined {
  const packageDir = findProductVitestPackageDir(productDir);
  if (packageDir === undefined) return undefined;
  const manifest: unknown = JSON.parse(readFileSync(join(packageDir, PACKAGE_MANIFEST_FILENAME), "utf8"));
  if (!isRecord(manifest)) return undefined;
  const exports = manifest[MANIFEST_EXPORTS_FIELD];
  if (!isRecord(exports)) return undefined;
  const target = resolveExportTarget(exports[MAIN_EXPORT_SUBPATH]);
  if (target === undefined) return undefined;
  const entryPath = resolve(packageDir, target);
  return existsSync(entryPath) ? realpathSync(entryPath) : undefined;
}

/** Dependencies a journal-streaming Vitest run is driven with: the evidence sink and the Vitest run-starter. */
export interface JournalRunDependencies {
  readonly sink: TestRunEvidenceSink;
  readonly starter: VitestRunStarter;
  /** Resolves the product's dependency lockfile once, before the run starts; defaults to the product-root lookup. */
  readonly findLockfile?: (productDir: string) => string | undefined;
  /** Resolves the product's own Vitest module once, before the run starts, for the worker setup file; defaults to the product-root lookup. */
  readonly findVitestEntry?: (productDir: string) => string | undefined;
}

/** Outcome of a journal-streaming run: it started and yielded a terminal status, or the product directory supplied no runner. */
export type JournalRunOutcome =
  | { readonly started: true; readonly terminalStatus: JournalRunTerminalStatus }
  | {
    readonly started: false;
    /** The product directory searched for the Vitest Node API. */
    readonly unresolvedProductDir: string;
  };

/**
 * Drives a journal-streaming Vitest run: registers a journal reporter forwarding to
 * the sink, starts the run through the injected starter, and yields the terminal
 * status the reporter captured — or the unresolved outcome when the starter found no
 * Vitest Node API in the product directory. A run in which any sink append rejected
 * rejects with the first such failure once the starter returns and yields no terminal
 * status, so a journal missing a unit is never sealed as complete.
 */
export async function runTestsStreaming(
  request: JournalRunRequest,
  deps: JournalRunDependencies,
): Promise<JournalRunOutcome> {
  const lockfilePath = (deps.findLockfile ?? findProductLockfile)(request.productDir);
  const vitestEntry = (deps.findVitestEntry ?? findProductVitestEntry)(request.productDir);
  const reporter = createJournalReporter(deps.sink, {
    realProductRoot: realRootOf(request.productDir),
    ...(lockfilePath === undefined ? {} : { lockfilePath }),
  });
  const start = await deps.starter.start({
    productDir: request.productDir,
    testPaths: request.testPaths,
    reporters: [reporter],
    setupFiles: [READ_RECORDER_SETUP_FILE],
    workerEnv: vitestEntry === undefined ? {} : { [READ_RECORDER_VITEST_ENTRY_ENV]: vitestEntry },
  });
  if (reporter.sinkFailure !== undefined) throw reporter.sinkFailure.failure;
  if (!start.started) return start;
  return {
    started: true,
    terminalStatus: reporter.terminalStatus ?? JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED,
  };
}

/**
 * Builds the production Vitest run starter over an injected Node API loader: it resolves
 * the Vitest Node API against the request's product directory, imports the module that
 * resolution named, starts a single non-watch run rooted at that directory with the given
 * reporters registered on it, and closes the instance when the run resolves. Resolution
 * happens only when a run actually starts, so the heavy Node API stays off this module's
 * import path. A product directory that supplies no Node API yields the unresolved outcome
 * naming that directory, distinguishable from a run that started and failed. A run that
 * observes a failing case sets `process.exitCode`, which the starter restores around the
 * run so a streaming run whose findings come from failing cases never leaks a non-zero exit
 * code to its caller.
 */
export function createVitestRunStarter(loader: VitestNodeApiLoader): VitestRunStarter {
  return {
    async start(options: VitestRunStartOptions): Promise<VitestRunStart> {
      const resolution = loader.resolve(options.productDir);
      if (!resolution.resolved) return { started: false, unresolvedProductDir: resolution.productDir };
      const { startVitest } = await loader.load(resolution.specifier);
      const priorExitCode = process.exitCode;
      try {
        const vitest = await startVitest(VITEST_RUN_MODE, [...options.testPaths], {
          root: options.productDir,
          watch: false,
          reporters: [...options.reporters],
          setupFiles: [...options.setupFiles],
          env: { ...options.workerEnv },
          experimental: { importDurations: { limit: IMPORT_DIAGNOSTIC_LIMIT } },
        });
        await vitest.close();
      } finally {
        process.exitCode = priorExitCode;
      }
      return { started: true };
    },
  };
}
