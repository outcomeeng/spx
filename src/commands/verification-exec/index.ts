/**
 * The spx-driven verification executor: it drives a verification type's deterministic runner over a
 * scope and records the run through the verify recorder lifecycle, naming no language. The runner is
 * resolved through the verification type's own registry module.
 */
import type { JournalStreamingRunner } from "@/commands/verification-exec/executor";
import { resolveTestRunner } from "@/commands/verification-exec/test-runner";
import { VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";

/**
 * Resolve a verification type's streaming runner through that type's own registry module. The `test`
 * type resolves through the testing registry; an unsupported type resolves to nothing so the
 * executor opens no run.
 */
export function resolveVerificationRunner(verificationType: string): JournalStreamingRunner | undefined {
  if (verificationType === VERIFY_VERIFICATION_TYPE.TEST) return resolveTestRunner();
  return undefined;
}

export {
  executeVerificationRun,
  type ExecutorDependencies,
  type ExecutorRecorderOperations,
  type ExecutorRunRequest,
  type ExecutorRunResult,
  type JournalStreamingRunner,
  recorderTerminalStatusFor,
} from "@/commands/verification-exec/executor";
export {
  createRecorderOperations,
  FINDING_KEY_SEPARATOR,
  RECORDER_OPERATION_ERROR,
  type RecorderOperationsConfig,
} from "@/commands/verification-exec/recorder-operations";
export { resolveTestRunner } from "@/commands/verification-exec/test-runner";
