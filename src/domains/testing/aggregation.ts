import type { TestRunInvocation } from "@/testing/languages/types";

export const SUCCESS_EXIT_CODE = 0;

/**
 * Aggregates per-language runner invocations into a single command exit code:
 * the first invoked runner's non-zero exit code, or success when every invoked
 * runner exited zero. Runners that detection gated out do not contribute.
 */
export function aggregateTestExitCode(invocations: readonly TestRunInvocation[]): number {
  for (const invocation of invocations) {
    if (invocation.invoked && invocation.exitCode !== SUCCESS_EXIT_CODE) {
      return invocation.exitCode;
    }
  }
  return SUCCESS_EXIT_CODE;
}
