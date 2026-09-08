/**
 * The verification-type→streaming-runner-resolver registry: the one place a deterministic verification
 * type registers how spx reaches its runner. Dispatch is a registry lookup keyed by the verification
 * type, never verification-type-name branching, mirroring the `EVIDENCE_VALIDATORS` registry in
 * `src/domains/verify/verify.ts`. Agentic types (`audit`, `review`) register no streaming runner.
 */
import type { JournalStreamingRunner } from "@/commands/verification-exec/executor";
import { resolveTestRunner } from "@/commands/verification-exec/test-runner";
import { VERIFY_VERIFICATION_TYPE, type VerifyVerificationType } from "@/domains/verify/verify";

const VERIFICATION_RUNNER_RESOLVERS: Readonly<Partial<Record<VerifyVerificationType, () => JournalStreamingRunner>>> = {
  [VERIFY_VERIFICATION_TYPE.TEST]: resolveTestRunner,
};

/**
 * The verification types spx can execute: the keys of the runner-resolver registry, in registration
 * order. The command surface derives its verification-type nouns from this list, so a type gains a
 * command path by registering a runner here and no descriptor names a type of its own.
 */
export const EXECUTABLE_VERIFICATION_TYPES: readonly VerifyVerificationType[] = Object.keys(
  VERIFICATION_RUNNER_RESOLVERS,
) as VerifyVerificationType[];

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
