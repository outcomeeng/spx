/**
 * The `spx verification <type> run [paths…]` command handler.
 *
 * The handler composes the spx-driven executor: it resolves the verb's positional operands to test
 * files through the testing selection domain, records one `file`-scoped run whose selector is the
 * narrowest directory enclosing every operand with the executor's request as the recorded run
 * input, drives the type's streaming runner through the verification-type registry over production
 * recorder operations rooted at the effective invocation directory, and returns the run locator, the
 * terminal status, and the runner outcome as one structured result. Diagnostics that embed an
 * operand or product path compose through the terminal-text primitive. The handler imports no
 * Commander symbol and writes to no process stream; the descriptor owns that boundary.
 */
import type { JournalStreamBinding } from "@/commands/journal/cli";
import { discoverTestFiles } from "@/commands/test";
import {
  executeVerificationRun,
  type ExecutorRunRequest,
  type JournalStreamingRunner,
  type UnresolvedRunner,
} from "@/commands/verification-exec/executor";
import { createRecorderOperations } from "@/commands/verification-exec/recorder-operations";
import { resolveVerificationRunner } from "@/commands/verification-exec/runner-registry";
import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { resolveTargetedTestFiles } from "@/domains/test";
import { executeRunScopeIdentity } from "@/domains/verification-exec/scope";
import { type RunLocator, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import type { GitDependencies } from "@/lib/git/root";
import type { StateStoreFileSystem } from "@/lib/state-store";
import { externalValue, renderTerminalText, terminal } from "@/lib/terminal-text/terminal-text";

/** The diagnostics the execute-run handler raises; each names the command path and the failing input. */
export const EXECUTE_RUN_CLI_ERROR = {
  UNRESOLVED_OPERANDS: "spx verification run matched no discovered test file for",
  UNSUPPORTED_VERIFICATION_TYPE: "spx verification run has no runner for verification type",
  UNRESOLVED_RUNNER: "spx verification run found no runner in the product directory",
} as const;

/** The input source recorded at start for an spx-driven run: the run input is the executor's request, not a caller source. */
export const EXECUTE_RUN_INPUT_SOURCE = "spx-driven";

const OPERAND_SEPARATOR = ", ";

/** The parsed command-path inputs: the type noun and the verb's positional operands and selection modifier. */
export interface ExecuteRunCliOptions {
  readonly verificationType: string;
  readonly operands: readonly string[];
  /** When true, a node-path operand selects its whole subtree, not only its own `tests/`. */
  readonly recursive: boolean;
}

/** The recorder dependencies the handler roots the run's recorder operations in: the state store, git, clock, branch, environment, and journal binding. */
export interface ExecuteRunRecorderDeps {
  readonly git?: GitDependencies;
  readonly branch?: string;
  readonly processEnv?: NodeJS.ProcessEnv;
  readonly fs?: StateStoreFileSystem;
  readonly now?: () => Date;
  readonly journalBinding?: JournalStreamBinding;
}

/** The handler's injected boundary: the invocation directory, discovery, the runner resolver, and the recorder. */
export interface ExecuteRunCliDeps {
  /** The effective invocation directory the run is rooted at. */
  readonly cwd: string;
  /** Discovers the product's test files; production walks the spec tree. */
  readonly discoverTestFiles?: (productDir: string) => Promise<readonly string[]>;
  /** Resolves a verification type's streaming runner; production reads the verification-type registry. */
  readonly resolveRunner?: (verificationType: string) => JournalStreamingRunner | undefined;
  /** The recorder dependencies the run records through. */
  readonly recorder: ExecuteRunRecorderDeps;
}

/** The run input recorded at start: the executor's request, replayable through `spx verification run input`. */
export interface ExecuteRunInputDocument {
  readonly verificationType: string;
  readonly operands: readonly string[];
  readonly recursive: boolean;
  readonly testPaths: readonly string[];
}

/** The structured result an executed run reports. */
export interface ExecuteRunReport {
  readonly runToken: string;
  readonly locator: RunLocator;
  readonly terminalStatus: string;
  readonly testPaths: readonly string[];
  readonly unresolvedRunner?: UnresolvedRunner;
}

/** The handler's result: an exit code, the structured report when a run executed, and a rendered diagnostic when one applies. */
export interface ExecuteRunCommandResult {
  readonly exitCode: number;
  readonly report?: ExecuteRunReport;
  readonly diagnostic?: string;
}

function unresolvedOperandsDiagnostic(operands: readonly string[]): string {
  return renderTerminalText(
    terminal`${EXECUTE_RUN_CLI_ERROR.UNRESOLVED_OPERANDS} ${externalValue(operands.join(OPERAND_SEPARATOR))}`,
  );
}

function unsupportedTypeDiagnostic(verificationType: string): string {
  return renderTerminalText(
    terminal`${EXECUTE_RUN_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE} ${externalValue(verificationType)}`,
  );
}

function unresolvedRunnerDiagnostic(unresolvedRunner: UnresolvedRunner): string {
  return renderTerminalText(
    terminal`${EXECUTE_RUN_CLI_ERROR.UNRESOLVED_RUNNER} ${externalValue(unresolvedRunner.productDir)}`,
  );
}

/**
 * Execute an spx-driven verification of the named type over the selected test files: resolve the
 * operands, open and drive the run through the executor, and report the run and its outcome. An
 * operand selecting no discovered test file opens no run; a product directory supplying no runner
 * seals the run and is named in the diagnostic; the exit code is zero exactly when the run passed.
 */
export async function executeRunCommand(
  options: ExecuteRunCliOptions,
  deps: ExecuteRunCliDeps,
): Promise<ExecuteRunCommandResult> {
  const productDir = deps.cwd;
  const discovered = await (deps.discoverTestFiles ?? discoverTestFiles)(productDir);
  const resolution = resolveTargetedTestFiles(discovered, {
    operands: options.operands,
    recursive: options.recursive,
  });
  if (resolution.unresolved.length > 0) {
    return { exitCode: VERIFY_CLI_EXIT_CODE.ERROR, diagnostic: unresolvedOperandsDiagnostic(resolution.unresolved) };
  }
  const testPaths = options.operands.length === 0 ? discovered : resolution.selected;
  const inputDocument: ExecuteRunInputDocument = {
    verificationType: options.verificationType,
    operands: options.operands,
    recursive: options.recursive,
    testPaths,
  };
  const request: ExecutorRunRequest = {
    verificationType: options.verificationType,
    scopeType: VERIFY_SCOPE_TYPE.FILE,
    scope: executeRunScopeIdentity(options.operands, discovered),
    productDir,
    testPaths,
  };
  const recorder = createRecorderOperations({
    input: EXECUTE_RUN_INPUT_SOURCE,
    deps: { ...deps.recorder, cwd: productDir, readInputSource: () => Promise.resolve(JSON.stringify(inputDocument)) },
  });
  const result = await executeVerificationRun(request, {
    resolveRunner: deps.resolveRunner ?? resolveVerificationRunner,
    recorder,
  });
  if (!result.executed) {
    return { exitCode: VERIFY_CLI_EXIT_CODE.ERROR, diagnostic: unsupportedTypeDiagnostic(options.verificationType) };
  }
  const report: ExecuteRunReport = {
    runToken: result.run.runToken,
    locator: result.run,
    terminalStatus: result.terminalStatus,
    testPaths,
    ...(result.unresolvedRunner === undefined ? {} : { unresolvedRunner: result.unresolvedRunner }),
  };
  const exitCode = result.terminalStatus === JOURNAL_RUN_STATE_STATUS.PASSED
    ? VERIFY_CLI_EXIT_CODE.OK
    : VERIFY_CLI_EXIT_CODE.ERROR;
  return result.unresolvedRunner === undefined
    ? { exitCode, report }
    : { exitCode, report, diagnostic: unresolvedRunnerDiagnostic(result.unresolvedRunner) };
}
