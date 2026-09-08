/**
 * The spx-driven verification executor: it drives a verification type's deterministic runner over a
 * scope and records the run through the verify recorder lifecycle, naming no language. The runner is
 * resolved through the verification type's own registry module.
 */
export {
  EXECUTE_RUN_CLI_ERROR,
  EXECUTE_RUN_INPUT_SOURCE,
  type ExecuteRunCliDeps,
  type ExecuteRunCliOptions,
  executeRunCommand,
  type ExecuteRunCommandResult,
  type ExecuteRunInputDocument,
  type ExecuteRunRecorderDeps,
  type ExecuteRunReport,
} from "@/commands/verification-exec/cli";
export {
  executeVerificationRun,
  type ExecutorDependencies,
  type ExecutorRecorderOperations,
  type ExecutorRunRequest,
  type ExecutorRunResult,
  type JournalStreamingRunner,
  recorderTerminalStatusFor,
  type UnresolvedRunner,
} from "@/commands/verification-exec/executor";
export {
  createRecorderOperations,
  RECORDER_OPERATION_ERROR,
  type RecorderOperationsConfig,
} from "@/commands/verification-exec/recorder-operations";
export { EXECUTABLE_VERIFICATION_TYPES, resolveVerificationRunner } from "@/commands/verification-exec/runner-registry";
export { resolveTestRunner } from "@/commands/verification-exec/test-runner";
