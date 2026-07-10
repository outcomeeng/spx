/**
 * Run all validations command.
 *
 * Iterates the language registry, executing each composed validation stage in
 * registry order and reporting every stage's result. Stage participation and
 * step count derive entirely from the registry — no stage is dispatched by name.
 */
import {
  VALIDATION_STAGE_PARTICIPATION,
  type ValidationStage,
  type ValidationStageParticipation,
} from "@/validation/languages/types";
import { validationPipelineStages } from "@/validation/registry";
import { formatDuration, formatSummary } from "./format";
import { formatValidationStageSkipJsonOutput, formatValidationStageSkipOutput } from "./messages";
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
  totalSteps: number,
  result: ValidationCommandResult,
  quiet: boolean,
): string {
  if (quiet || !result.output) return "";

  const timing = result.durationMs === undefined ? "" : ` (${formatDuration(result.durationMs)})`;
  return `[${stepNumber}/${totalSteps}] ${result.output}${timing}`;
}

interface ResolvedStageParticipation {
  readonly participation: ValidationStageParticipation;
  readonly reason?: string;
  readonly flag?: string;
}

function resolveStageParticipation(
  stage: ValidationStage,
  participationOverrides: ReadonlySet<string>,
): ResolvedStageParticipation {
  const override = stage.participation.override;
  if (override !== undefined && participationOverrides.has(override.flag)) {
    return {
      participation: override.participation,
      reason: override.reason,
      flag: override.flag,
    };
  }
  return {
    participation: stage.participation.default,
    reason: stage.participation.defaultSkipReason,
  };
}

function skippedStageResult(
  stage: ValidationStage,
  participation: ResolvedStageParticipation,
  json?: boolean,
): ValidationCommandResult {
  const reason = participation.reason;
  if (reason === undefined) {
    throw new Error(`validation stage ${stage.name} skipped without a configured reason`);
  }
  return {
    exitCode: 0,
    output: json
      ? formatValidationStageSkipJsonOutput(reason)
      : formatValidationStageSkipOutput(stage.name, participation.flag ?? reason),
  };
}

function recordStepOutput(
  stepOutput: string,
  outputs: string[],
  writeStageOutput: ((output: string) => void) | undefined,
): boolean {
  if (stepOutput.length === 0) return false;
  if (writeStageOutput === undefined) {
    outputs.push(stepOutput);
  } else {
    writeStageOutput(`${stepOutput}\n`);
  }
  return true;
}

/**
 * Run all validation steps.
 *
 * @param options - Command options
 * @returns Command result with exit code and output
 */
export async function allCommand(options: AllCommandOptions): Promise<ValidationCommandResult> {
  const {
    cwd,
    scope,
    files,
    fix,
    quiet = false,
    json,
    participationOverrides = [],
    validationStages = validationPipelineStages,
    writeStageOutput,
    outputStreams,
  } = options;
  const startTime = Date.now();
  const outputs: string[] = [];
  let wroteStageOutput = false;
  let hasFailure = false;

  const context = { cwd, scope, files, fix, quiet, json, outputStreams };
  const overrideFlags = new Set(participationOverrides);

  let stepNumber = 0;
  for (const stage of validationStages) {
    stepNumber += 1;
    const stageStartTime = Date.now();
    const participation = resolveStageParticipation(stage, overrideFlags);
    const stageResult = participation.participation === VALIDATION_STAGE_PARTICIPATION.RUN
      ? await stage.run(context)
      : skippedStageResult(stage, participation, json);
    const result = stageResult.durationMs === undefined
      ? { ...stageResult, durationMs: Date.now() - stageStartTime }
      : stageResult;
    const stepOutput = formatStepWithTiming(stepNumber, validationStages.length, result, quiet);
    wroteStageOutput = recordStepOutput(stepOutput, outputs, writeStageOutput) || wroteStageOutput;
    if (stage.failsPipeline && result.exitCode !== 0) hasFailure = true;
  }

  // Calculate total duration
  const totalDurationMs = Date.now() - startTime;

  // Add summary line
  if (!quiet) {
    const summary = formatSummary({ success: !hasFailure, totalDurationMs });
    const summaryPrefix = writeStageOutput === undefined || !wroteStageOutput ? "" : "\n";
    outputs.push(`${summaryPrefix}${summary}`);
  }

  return {
    exitCode: hasFailure ? 1 : 0,
    output: outputs.join("\n"),
    durationMs: totalDurationMs,
  };
}
