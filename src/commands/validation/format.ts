/**
 * Output formatting functions for validation commands.
 *
 * Pure functions that format validation results for CLI display.
 * These functions have no side effects and are fully testable.
 */

/** Threshold in milliseconds for switching from ms to seconds display */
export const DURATION_THRESHOLD_MS = 1000;

/** Symbols used in validation output */
export const VALIDATION_SYMBOLS = {
  SUCCESS: "✓",
  FAILURE: "✗",
} as const;

export const VALIDATION_SUMMARY_STATUS = {
  PASSED: "passed",
  FAILED: "failed",
} as const;

/**
 * Format a duration in milliseconds for display.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "500ms" or "1.5s")
 */
export function formatDuration(ms: number): string {
  if (ms < DURATION_THRESHOLD_MS) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  return `${seconds.toFixed(1)}s`;
}

/** Options for formatting a validation step output */
export interface FormatStepOptions {
  /** Current step number (1-indexed) */
  stepNumber: number;
  /** Total number of steps */
  totalSteps: number;
  /** Name of the validation step */
  name: string;
  /** Result message (e.g., "✓ No errors found") */
  result: string;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Format a validation step result for display.
 *
 * @param options - Step formatting options
 * @returns Formatted string (e.g., "[1/4] ESLint: ✓ No errors found (0.8s)")
 */
export function formatStepOutput(options: FormatStepOptions): string {
  const { stepNumber, totalSteps, name, result, durationMs } = options;
  const duration = formatDuration(durationMs);
  return `[${stepNumber}/${totalSteps}] ${name}: ${result} (${duration})`;
}

/** Options for formatting the validation summary */
export interface FormatSummaryOptions {
  /** Whether all required validations passed */
  success: boolean;
  /** Total duration in milliseconds */
  totalDurationMs: number;
}

/**
 * Format the final validation summary.
 *
 * @param options - Summary formatting options
 * @returns Formatted string (e.g., "✓ Validation passed (2.7s total)")
 */
export function formatSummary(options: FormatSummaryOptions): string {
  const { success, totalDurationMs } = options;
  const symbol = success ? VALIDATION_SYMBOLS.SUCCESS : VALIDATION_SYMBOLS.FAILURE;
  const status = success ? VALIDATION_SUMMARY_STATUS.PASSED : VALIDATION_SUMMARY_STATUS.FAILED;
  const duration = formatDuration(totalDurationMs);
  return `${symbol} Validation ${status} (${duration} total)`;
}
