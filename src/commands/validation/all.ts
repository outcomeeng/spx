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
import {
  formatValidationStageJsonOutput,
  formatValidationStageSkipJsonOutput,
  formatValidationStageSkipOutput,
} from "./messages";
import type { AllCommandOptions, ValidationCommandResult, ValidationStageCompletion } from "./types";

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
  stageName: string,
  result: ValidationCommandResult,
  quiet: boolean,
  json: boolean,
): string {
  const output = result.terminalOutput ?? result.output;
  if (quiet) return "";
  if (result.structuredOutput === true) return output;
  if (json) {
    return formatValidationStageJsonOutput({
      stage: stageName,
      exitCode: result.exitCode,
      output,
      ...(result.durationMs === undefined ? {} : { durationMs: result.durationMs }),
    });
  }
  if (!output) return "";

  const timing = result.durationMs === undefined ? "" : ` (${formatDuration(result.durationMs)})`;
  return `[${stepNumber}/${totalSteps}] ${output}${timing}`;
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
  durationMs: number = 0,
): ValidationCommandResult {
  const reason = participation.reason;
  if (reason === undefined) {
    throw new Error(`validation stage ${stage.name} skipped without a configured reason`);
  }
  return {
    exitCode: 0,
    output: json
      ? formatValidationStageSkipJsonOutput(reason, durationMs)
      : formatValidationStageSkipOutput(stage.name, participation.flag ?? reason),
    structuredOutput: json,
    durationMs,
  };
}

function recordStepOutput(
  completion: ValidationStageCompletion,
  outputs: string[],
  onStageComplete: ((completion: ValidationStageCompletion) => void) | undefined,
): boolean {
  if (completion.output.length === 0) return false;
  if (onStageComplete === undefined) {
    outputs.push(completion.output);
  } else {
    onStageComplete(completion);
  }
  return true;
}

export function resolveFullPipelineStages(
  validationStages: readonly ValidationStage[] | undefined,
): readonly ValidationStage[] {
  return validationStages ?? validationPipelineStages;
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
    validationStages: requestedValidationStages,
    onStageComplete,
    outputStreams,
  } = options;
  const validationStages = resolveFullPipelineStages(requestedValidationStages);
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
      : skippedStageResult(stage, participation, json, Date.now() - stageStartTime);
    const result = stageResult.durationMs === undefined
      ? { ...stageResult, durationMs: Date.now() - stageStartTime }
      : stageResult;
    const stepOutput = formatStepWithTiming(
      stepNumber,
      validationStages.length,
      stage.name,
      result,
      quiet,
      json === true,
    );
    wroteStageOutput = recordStepOutput(
      {
        stepNumber,
        totalSteps: validationStages.length,
        stageName: stage.name,
        result,
        output: stepOutput,
      },
      outputs,
      onStageComplete,
    ) || wroteStageOutput;
    if (stage.failsPipeline && result.exitCode !== 0) hasFailure = true;
  }

  // Calculate total duration
  const totalDurationMs = Date.now() - startTime;

  // Add summary line
  if (!quiet && json !== true) {
    const summary = formatSummary({ success: !hasFailure, totalDurationMs });
    const summaryPrefix = wroteStageOutput ? "\n" : "";
    outputs.push(`${summaryPrefix}${summary}`);
  }

  return {
    exitCode: hasFailure ? 1 : 0,
    output: outputs.join("\n"),
    durationMs: totalDurationMs,
  };
}
