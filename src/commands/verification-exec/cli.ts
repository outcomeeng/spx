/**
 * The `spx verification <type> run [paths…]` command handler.
 *
 * The handler composes the spx-driven executor: it resolves the verb's positional operands to test
 * files through the shared operand-selection library, records one `file`-scoped run whose selector is the
 * narrowest directory enclosing every operand with the executor's request as the recorded run
 * input, drives the type's streaming runner through the verification-type registry over production
 * recorder operations rooted at the worktree product root, and returns the run locator, the terminal
 * status, and the runner outcome as one structured result. The product root is the local worktree
 * root the effective invocation directory resolves to, so an invocation from any directory inside
 * the product discovers and records against the same tree; outside a repository the invocation
 * directory itself is the root and the result carries a warning saying so. The warning and every
 * diagnostic that embeds an operand, a product path, or a caught failure message are composed
 * through the terminal-text primitive here, where each value's provenance is still known, and reach
 * the descriptor as composed text; the exit code is zero exactly when the run passed. The handler imports no Commander symbol and
 * writes to no process stream; the descriptor owns that boundary.
 */
import { discoverTestFiles } from "@/commands/test";
import {
  executeVerificationRun,
  type ExecutorRunRequest,
  type JournalStreamingRunner,
  type UnresolvedRunner,
} from "@/commands/verification-exec/executor";
import { createRecorderOperations } from "@/commands/verification-exec/recorder-operations";
import { resolveVerificationRunner } from "@/commands/verification-exec/runner-registry";
import { VERIFY_CLI_EXIT_CODE, type VerifyCliDeps } from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS, type JournalRunStateStatus } from "@/domains/journal/run-state";
import { executeRunScopeIdentity } from "@/domains/verification-exec/scope";
import { type RunLocator, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { toMessage } from "@/lib/error-message";
import { detectWorktreeProductRoot } from "@/lib/git/root";
import { authoredText, externalValue, terminal, type TerminalText } from "@/lib/terminal-text/terminal-text";
import { resolveTargetedTestFiles } from "@/lib/test-targeting";

/** The diagnostics the execute-run command path raises; each names the command path and the failing input. */
export const EXECUTE_RUN_CLI_ERROR = {
  UNRESOLVED_OPERANDS: "spx verification <type> run matched no discovered test file for",
  UNSUPPORTED_VERIFICATION_TYPE: "spx verification <type> run has no runner for verification type",
  UNRESOLVED_RUNNER: "spx verification <type> run found no runner in the product directory",
  RUN_FAILED: "spx verification <type> run did not complete:",
} as const;

/** The warnings the execute-run command path reports beside a result. */
export const EXECUTE_RUN_CLI_WARNING = {
  NOT_GIT_REPOSITORY:
    "Warning: Not in a git repository. Rooting the verification run at the current working directory.",
} as const;

/** The same warning composed for a terminal: wholly product-authored, carrying no external segment. */
export const EXECUTE_RUN_CLI_WARNING_TEXT = {
  NOT_GIT_REPOSITORY: authoredText(EXECUTE_RUN_CLI_WARNING.NOT_GIT_REPOSITORY),
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

/** The recorder dependencies the handler and its recorder operations supply themselves: the product root, the input readers, and the drive mode. */
interface SuppliedRecorderDeps {
  readonly cwd: VerifyCliDeps["cwd"];
  readonly readInputSource: VerifyCliDeps["readInputSource"];
  readonly readPayloadSource: VerifyCliDeps["readPayloadSource"];
  readonly driveMode: VerifyCliDeps["driveMode"];
}

/**
 * The recorder dependencies the handler roots the run's recorder operations in — the recorder's own
 * dependency shape minus what the handler and its recorder operations supply themselves.
 */
export type ExecuteRunRecorderDeps = Omit<VerifyCliDeps, keyof SuppliedRecorderDeps>;

/** The product root a run is rooted at, and whether a repository supplied it. */
export interface ExecuteRunProductRoot {
  readonly productDir: string;
  /** False when the invocation directory lies outside a git repository and stands in for the root. */
  readonly isGitRepo: boolean;
}

/** The handler's injected boundary: the invocation directory, product-root resolution, discovery, the runner resolver, and the recorder. */
export interface ExecuteRunCliDeps {
  /** The effective invocation directory the product root is resolved from. */
  readonly cwd: string;
  /** Resolves the product root the run is rooted at; production resolves the local worktree root, falling back to the invocation directory outside a repository. */
  readonly resolveProductDir?: (cwd: string) => Promise<ExecuteRunProductRoot>;
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
  readonly terminalStatus: JournalRunStateStatus;
  readonly testPaths: readonly string[];
  readonly unresolvedRunner?: UnresolvedRunner;
}

/**
 * The handler's result: an exit code, the structured report when a run executed, a rendered
 * diagnostic when one applies, and a warning when the run was rooted outside a repository.
 */
export interface ExecuteRunCommandResult {
  readonly exitCode: number;
  readonly report?: ExecuteRunReport;
  readonly diagnostic?: TerminalText;
  readonly warning?: TerminalText;
}

function unresolvedOperandsDiagnostic(operands: readonly string[]): TerminalText {
  return terminal`${authoredText(EXECUTE_RUN_CLI_ERROR.UNRESOLVED_OPERANDS)} ${
    externalValue(operands.join(OPERAND_SEPARATOR))
  }`;
}

function unsupportedTypeDiagnostic(verificationType: string): TerminalText {
  return terminal`${authoredText(EXECUTE_RUN_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE)} ${
    externalValue(verificationType)
  }`;
}

function unresolvedRunnerDiagnostic(unresolvedRunner: UnresolvedRunner): TerminalText {
  return terminal`${authoredText(EXECUTE_RUN_CLI_ERROR.UNRESOLVED_RUNNER)} ${
    externalValue(unresolvedRunner.productDir)
  }`;
}

/** The diagnostic for a run the handler could not complete — a recorder or runner failure — with the caught message as an external segment. */
export function executeRunFailureDiagnostic(error: unknown): TerminalText {
  return terminal`${authoredText(EXECUTE_RUN_CLI_ERROR.RUN_FAILED)} ${externalValue(toMessage(error))}`;
}

/**
 * Execute an spx-driven verification of the named type over the selected test files: resolve the
 * product root and the operands, open and drive the run through the executor, and report the run
 * and its outcome. A recorder or runner failure propagates to the caller after the executor's
 * best-effort seal; the descriptor renders it as a diagnostic. An operand selecting no discovered
 * test file opens no run; a product directory supplying no runner seals the run and is named in the
 * diagnostic; a root outside a repository carries a warning; the exit code is zero exactly when the
 * run passed.
 */
export async function executeRunCommand(
  options: ExecuteRunCliOptions,
  deps: ExecuteRunCliDeps,
): Promise<ExecuteRunCommandResult> {
  const root = await (deps.resolveProductDir ?? detectWorktreeProductRoot)(deps.cwd);
  const productDir = root.productDir;
  const warning = root.isGitRepo ? {} : { warning: EXECUTE_RUN_CLI_WARNING_TEXT.NOT_GIT_REPOSITORY };
  const discovered = await (deps.discoverTestFiles ?? discoverTestFiles)(productDir);
  const resolution = resolveTargetedTestFiles(discovered, {
    operands: options.operands,
    recursive: options.recursive,
  });
  if (resolution.unresolved.length > 0) {
    return {
      exitCode: VERIFY_CLI_EXIT_CODE.ERROR,
      diagnostic: unresolvedOperandsDiagnostic(resolution.unresolved),
      ...warning,
    };
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
    return {
      exitCode: VERIFY_CLI_EXIT_CODE.ERROR,
      diagnostic: unsupportedTypeDiagnostic(options.verificationType),
      ...warning,
    };
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
    ? { exitCode, report, ...warning }
    : { exitCode, report, diagnostic: unresolvedRunnerDiagnostic(result.unresolvedRunner), ...warning };
}
