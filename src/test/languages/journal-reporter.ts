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
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { Reporter, TestCase, TestModule, TestRunEndReason } from "vitest/node";

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
/** The specifier the run resolves against the product directory to reach the Vitest Node API. */
export const VITEST_NODE_API_SPECIFIER = `${VITEST_PACKAGE_NAME}/${VITEST_NODE_API_ENTRY}`;
/** The Vitest run mode a journal-streaming run starts. */
export const VITEST_RUN_MODE = "test";

/** The directory a product's installed packages resolve from, at the product directory or an ancestor. */
const PACKAGE_DEPENDENCIES_DIRECTORY = "node_modules";
/** The manifest a package declares its entry points in; resolution is anchored at the product's Vitest manifest. */
const PACKAGE_MANIFEST_FILENAME = "package.json";

/** The Node resolver error codes meaning the product's Vitest package exposes no Node API entry. */
const UNRESOLVABLE_MODULE_ERROR_CODES: ReadonlySet<string> = new Set([
  "MODULE_NOT_FOUND",
  "ERR_PACKAGE_PATH_NOT_EXPORTED",
]);

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

function isUnresolvableModuleError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
    && UNRESOLVABLE_MODULE_ERROR_CODES.has(error.code)
  );
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
 * directory's own `node_modules` hierarchy, resolves the Node API entry from inside that
 * package — Node's self-reference resolution honors the package's `exports` map — and
 * imports the resolved file. Anchoring at the product keeps the version the product
 * selected in force; a bare specifier would resolve against the harness's own install instead.
 */
export const productVitestNodeApiLoader: VitestNodeApiLoader = {
  resolve(productDir: string): VitestNodeApiResolution {
    const packageDir = findProductVitestPackageDir(productDir);
    if (packageDir === undefined) return { resolved: false, productDir };
    const packageRequire = createRequire(join(packageDir, PACKAGE_MANIFEST_FILENAME));
    try {
      return { resolved: true, specifier: packageRequire.resolve(VITEST_NODE_API_SPECIFIER) };
    } catch (error) {
      if (isUnresolvableModuleError(error)) return { resolved: false, productDir };
      throw error;
    }
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

/** A journal reporter: a Vitest reporter streaming scope and finding evidence, plus the terminal status it captured. */
export interface JournalReporter extends Reporter {
  /** The terminal status captured from the run's end reason, or undefined before the run ends. */
  readonly terminalStatus: JournalRunTerminalStatus | undefined;
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

/**
 * Builds a journal reporter that forwards each Vitest lifecycle event to the sink as
 * it fires: a started module records a scope, a failing case records a finding, a
 * passing case records nothing, and run end captures the terminal status. Each hook
 * awaits its sink append before returning, and Vitest awaits the hook, so an async
 * sink's write completes before the run advances to the next hook or run end.
 * Constructs no journal events and performs no I/O — every durable effect flows
 * through the sink.
 */
export function createJournalReporter(sink: TestRunEvidenceSink): JournalReporter {
  let terminalStatus: JournalRunTerminalStatus | undefined;
  return {
    async onTestModuleStart(module: TestModule): Promise<void> {
      await sink.appendScope({ moduleId: module.moduleId });
    },
    async onTestCaseResult(testCase: TestCase): Promise<void> {
      const result = testCase.result();
      if (result.state !== VITEST_FAILED_CASE_STATE) return;
      await sink.appendFinding({
        moduleId: testCase.module.moduleId,
        testName: testCase.fullName,
        errors: findingErrorMessages(result.errors),
      });
    },
    onTestRunEnd(_modules, _errors, reason: TestRunEndReason): void {
      terminalStatus = terminalStatusFromReason(reason);
    },
    get terminalStatus(): JournalRunTerminalStatus | undefined {
      return terminalStatus;
    },
  };
}

/** Dependencies a journal-streaming Vitest run is driven with: the evidence sink and the Vitest run-starter. */
export interface JournalRunDependencies {
  readonly sink: TestRunEvidenceSink;
  readonly starter: VitestRunStarter;
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
 * Vitest Node API in the product directory.
 */
export async function runTestsStreaming(
  request: JournalRunRequest,
  deps: JournalRunDependencies,
): Promise<JournalRunOutcome> {
  const reporter = createJournalReporter(deps.sink);
  const start = await deps.starter.start({
    productDir: request.productDir,
    testPaths: request.testPaths,
    reporters: [reporter],
  });
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
        });
        await vitest.close();
      } finally {
        process.exitCode = priorExitCode;
      }
      return { started: true };
    },
  };
}
