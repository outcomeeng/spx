/**
 * Run all validations command.
 *
 * Iterates the language registry, executing each composed validation stage in
 * registry order and reporting every stage's result. Stage participation and
 * step count derive entirely from the registry — no stage is dispatched by name.
 */
import { VALIDATION_PIPELINE_TOTAL_STEPS, validationPipelineStages } from "@/validation/registry";
import { formatDuration, formatSummary } from "./format";
import type { AllCommandOptions, ValidationCommandResult } from "./types";

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
  return `[${stepNumber}/${VALIDATION_PIPELINE_TOTAL_STEPS}] ${result.output}${timing}`;
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

  const context = { cwd, scope, files, fix, quiet, json, skipLiteral };

  let stepNumber = 0;
  for (const stage of validationPipelineStages) {
    stepNumber += 1;
    const result = await stage.run(context);
    const stepOutput = formatStepWithTiming(stepNumber, result, quiet);
    if (stepOutput) outputs.push(stepOutput);
    if (stage.failsPipeline && result.exitCode !== 0) hasFailure = true;
  }

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
