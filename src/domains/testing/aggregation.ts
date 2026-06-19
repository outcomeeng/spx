import type { TestRunInvocation } from "@/testing/languages/types";

export const SUCCESS_EXIT_CODE = 0;
export const UNSUPPORTED_TEST_SELECTION_EXIT_CODE = 1;
export const NO_RUNNER_INVOCATION_EXIT_CODE = UNSUPPORTED_TEST_SELECTION_EXIT_CODE;

/**
 * Aggregates per-language runner invocations into a single command exit code:
 * the first invoked runner's non-zero exit code, an unsupported-selection
 * failure when every invoked runner exited zero, a no-runner-invoked failure
 * when selected runner groups all gate out, or success otherwise.
 */
export function aggregateTestExitCode(
  invocations: readonly TestRunInvocation[],
  unsupportedSelectionCount = 0,
): number {
  for (const invocation of invocations) {
    if (invocation.invoked && invocation.exitCode !== SUCCESS_EXIT_CODE) {
      return invocation.exitCode;
    }
  }
  if (unsupportedSelectionCount > 0) {
    return UNSUPPORTED_TEST_SELECTION_EXIT_CODE;
  }
  if (invocations.length > 0 && invocations.every((invocation) => !invocation.invoked)) {
    return NO_RUNNER_INVOCATION_EXIT_CODE;
  }
  return SUCCESS_EXIT_CODE;
}
