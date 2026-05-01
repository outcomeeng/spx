/**
 * Run all validations command.
 *
 * Executes all validation steps in sequence:
 * 1. Circular dependencies (fastest)
 * 2. Knip (optional)
 * 3. ESLint
 * 4. TypeScript
 * 5. Markdown
 * 6. Literal reuse
 */
import { circularCommand } from "./circular";
import { formatDuration, formatSummary } from "./format";
import { knipCommand } from "./knip";
import { lintCommand } from "./lint";
import { literalCommand } from "./literal";
import { markdownCommand } from "./markdown";
import type { AllCommandOptions, ValidationCommandResult } from "./types";
import { typescriptCommand } from "./typescript";

/** Total number of validation steps */
const TOTAL_STEPS = 6;
export const LITERAL_SKIP_OUTPUT = "Literal: skipped (--skip-literal)";
export const LITERAL_SKIP_JSON_OUTPUT = JSON.stringify({
  skipped: true,
  reason: "skip-literal",
});

/**
 * Format step output with step number and timing.
 *
 * @param stepNumber - Current step number (1-indexed)
 * @param result - Validation result
 * @param quiet - Whether to suppress output
 * @returns Formatted output string
 */
function formatStepWithTiming(
  stepNumber: number,
  result: ValidationCommandResult,
  quiet: boolean,
): string {
  if (quiet || !result.output) return "";

  const timing = result.durationMs === undefined ? "" : ` (${formatDuration(result.durationMs)})`;
  return `[${stepNumber}/${TOTAL_STEPS}] ${result.output}${timing}`;
}

/**
 * Run all validation steps.
 *
 * @param options - Command options
 * @returns Command result with exit code and output
 */
export async function allCommand(options: AllCommandOptions): Promise<ValidationCommandResult> {
  const { cwd, scope, files, fix, quiet = false, json, skipLiteral = false } = options;
  const startTime = Date.now();
  const outputs: string[] = [];
  let hasFailure = false;

  // 1. Circular dependencies
  const circularResult = await circularCommand({ cwd, quiet, json });
  const circularOutput = formatStepWithTiming(1, circularResult, quiet);
  if (circularOutput) outputs.push(circularOutput);
  if (circularResult.exitCode !== 0) hasFailure = true;

  // 2. Knip (optional - skip on failure, it's informational)
  const knipResult = await knipCommand({ cwd, quiet, json });
  const knipOutput = formatStepWithTiming(2, knipResult, quiet);
  if (knipOutput) outputs.push(knipOutput);
  // Don't fail on knip - it's optional

  // 3. ESLint
  const lintResult = await lintCommand({ cwd, scope, files, fix, quiet, json });
  const lintOutput = formatStepWithTiming(3, lintResult, quiet);
  if (lintOutput) outputs.push(lintOutput);
  if (lintResult.exitCode !== 0) hasFailure = true;

  // 4. TypeScript
  const tsResult = await typescriptCommand({ cwd, scope, files, quiet, json });
  const tsOutput = formatStepWithTiming(4, tsResult, quiet);
  if (tsOutput) outputs.push(tsOutput);
  if (tsResult.exitCode !== 0) hasFailure = true;

  // 5. Markdown
  const markdownResult = await markdownCommand({ cwd, files, quiet });
  const markdownOutput = formatStepWithTiming(5, markdownResult, quiet);
  if (markdownOutput) outputs.push(markdownOutput);
  if (markdownResult.exitCode !== 0) hasFailure = true;

  // 6. Literal reuse
  const literalSkipOutput = json ? LITERAL_SKIP_JSON_OUTPUT : LITERAL_SKIP_OUTPUT;
  const literalResult = skipLiteral
    ? { exitCode: 0, output: quiet ? "" : literalSkipOutput, durationMs: 0 }
    : await literalCommand({ cwd, files, quiet, json });
  const literalOutput = formatStepWithTiming(6, literalResult, quiet);
  if (literalOutput) outputs.push(literalOutput);
  if (literalResult.exitCode !== 0) hasFailure = true;

  // Calculate total duration
  const totalDurationMs = Date.now() - startTime;

  // Add summary line
  if (!quiet) {
    const summary = formatSummary({ success: !hasFailure, totalDurationMs });
    outputs.push("", summary); // Empty line before summary
  }

  return {
    exitCode: hasFailure ? 1 : 0,
    output: outputs.join("\n"),
    durationMs: totalDurationMs,
  };
}
