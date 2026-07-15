/**
 * The spx-driven verification executor: it drives a verification type's deterministic runner over a
 * scope and records the run through the verify recorder lifecycle, naming no language. The runner is
 * resolved through the verification type's own registry module.
 */
import type { JournalStreamingRunner } from "@/commands/verification-exec/executor";
import { resolveTestRunner } from "@/commands/verification-exec/test-runner";
import { VERIFY_VERIFICATION_TYPE, type VerifyVerificationType } from "@/domains/verify/verify";

/**
 * The verification-type→streaming-runner-resolver registry. Dispatch is a registry lookup keyed by
 * the verification type, never verification-type-name branching; a new deterministic verification
 * type registers its runner resolver here, mirroring the `EVIDENCE_VALIDATORS` registry in
 * `src/domains/verify/verify.ts`. Agentic types (`audit`, `review`) register no streaming runner.
 */
const VERIFICATION_RUNNER_RESOLVERS: Readonly<Partial<Record<VerifyVerificationType, () => JournalStreamingRunner>>> = {
  [VERIFY_VERIFICATION_TYPE.TEST]: resolveTestRunner,
};

/**
 * Resolve a verification type's streaming runner through that type's own registry module. The `test`
 * type resolves through the testing registry; an unsupported type resolves to nothing so the
 * executor opens no run.
 */
export function resolveVerificationRunner(verificationType: string): JournalStreamingRunner | undefined {
  return (
    VERIFICATION_RUNNER_RESOLVERS as Readonly<Record<string, (() => JournalStreamingRunner) | undefined>>
  )[verificationType]?.();
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
  RECORDER_OPERATION_ERROR,
  type RecorderOperationsConfig,
} from "@/commands/verification-exec/recorder-operations";
export { resolveTestRunner } from "@/commands/verification-exec/test-runner";
