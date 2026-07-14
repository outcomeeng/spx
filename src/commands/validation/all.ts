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
  type ValidationStageContext,
  type ValidationStageParticipation,
} from "@/validation/languages/types";
import { validationPipelineStages } from "@/validation/registry";
import type { ValidationSubprocessOutputStreams, ValidationWritableStream } from "@/validation/steps/subprocess-output";
import { formatDuration, formatSummary, VALIDATION_SYMBOLS } from "./format";
import {
  formatValidationStageSkipJsonOutput,
  formatValidationStageSkipOutput,
  VALIDATION_STREAMED_STAGE_RESULT,
} from "./messages";
import type {
  AllCommandOptions,
  AllValidationJsonOutput,
  AllValidationJsonStep,
  ValidationCommandResult,
  ValidationStageCompletion,
} from "./types";
import { VALIDATION_OUTPUT_TARGET, VALIDATION_STREAMED_TERMINAL_OUTPUT } from "./types";

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
): string {
  const output = result.terminalOutput ?? result.output;
  if (quiet) return "";

  if (result.terminalOutput === VALIDATION_STREAMED_TERMINAL_OUTPUT) {
    const verdict = result.exitCode === 0 ? VALIDATION_SYMBOLS.SUCCESS : VALIDATION_SYMBOLS.FAILURE;
    const timing = result.durationMs === undefined ? "" : ` (${formatDuration(result.durationMs)})`;
    return `[${stepNumber}/${totalSteps}] ${stageName}: ${verdict} ${VALIDATION_STREAMED_STAGE_RESULT}${timing}`;
  }

  if (!output) return "";

  const timing = result.durationMs === undefined ? "" : ` (${formatDuration(result.durationMs)})`;
  return `[${stepNumber}/${totalSteps}] ${output}${timing}`;
}

function parseStageOutput(output: string): unknown {
  if (output.length === 0) return null;
  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}

interface RecordStageResultOptions {
  readonly json: boolean;
  readonly stepNumber: number;
  readonly totalSteps: number;
  readonly stage: ValidationStage;
  readonly result: ValidationCommandResult;
  readonly quiet: boolean;
  readonly outputs: string[];
  readonly jsonSteps: AllValidationJsonStep[];
  readonly subprocessOutput?: CapturedSubprocessOutput;
  readonly writeOutput?: (output: string) => void;
}

function recordStageResult(options: RecordStageResultOptions): void {
  const {
    json,
    stepNumber,
    totalSteps,
    stage,
    result,
    quiet,
    outputs,
    jsonSteps,
    subprocessOutput,
    writeOutput,
  } = options;
  if (json) {
    jsonSteps.push({
      name: stage.name,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      output: parseStageOutput(result.output),
      stdout: subprocessOutput?.stdout.join("") ?? "",
      stderr: subprocessOutput?.stderr.join("") ?? "",
    });
    return;
  }

  const stepOutput = formatStepWithTiming(stepNumber, totalSteps, stage.name, result, quiet);
  if (stepOutput) {
    outputs.push(stepOutput);
    writeOutput?.(stepOutput);
  }
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
  json: boolean,
  durationMs: number,
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

interface CapturedSubprocessOutput {
  readonly streams: ValidationSubprocessOutputStreams;
  readonly stdout: string[];
  readonly stderr: string[];
}

function createCapturedSubprocessOutput(): CapturedSubprocessOutput {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    streams: {
      stdout: createCaptureStream(stdout),
      stderr: createCaptureStream(stderr),
    },
  };
}

function createCaptureStream(chunks: string[]): ValidationWritableStream {
  return {
    write: (chunk) => {
      chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
      return true;
    },
  };
}

export interface AllCommandDependencies {
  readonly stages?: readonly ValidationStage[];
  readonly writeOutput?: (output: string) => void;
  readonly now?: () => number;
}

export function resolveFullPipelineStages(
  validationStages: readonly ValidationStage[] | undefined,
  dependencyStages?: readonly ValidationStage[],
): readonly ValidationStage[] {
  return validationStages ?? dependencyStages ?? validationPipelineStages;
}

interface ExecuteValidationStagesOptions {
  readonly stages: readonly ValidationStage[];
  readonly context: ValidationStageContext;
  readonly participationOverrides: ReadonlySet<string>;
  readonly json: boolean;
  readonly quiet: boolean;
  readonly outputs: string[];
  readonly jsonSteps: AllValidationJsonStep[];
  readonly onStageComplete?: (completion: ValidationStageCompletion) => void;
  readonly outputStreams?: ValidationSubprocessOutputStreams;
  readonly writeOutput?: (output: string) => void;
  readonly now: () => number;
}

async function executeValidationStages(options: ExecuteValidationStagesOptions): Promise<boolean> {
  let hasFailure = false;
  for (const [index, stage] of options.stages.entries()) {
    const stepNumber = index + 1;
    const execution = await executeValidationStage(stage, options);
    recordStageResult({
      json: options.json,
      stepNumber,
      totalSteps: options.stages.length,
      stage,
      result: execution.result,
      quiet: options.quiet,
      outputs: options.outputs,
      jsonSteps: options.jsonSteps,
      subprocessOutput: execution.subprocessOutput,
      writeOutput: options.writeOutput,
    });
    notifyStageCompletion(stage, execution.result, stepNumber, options);
    hasFailure ||= stage.failsPipeline && execution.result.exitCode !== 0;
  }
  return hasFailure;
}

interface ExecutedValidationStage {
  readonly result: ValidationCommandResult;
  readonly subprocessOutput?: CapturedSubprocessOutput;
}

async function executeValidationStage(
  stage: ValidationStage,
  options: ExecuteValidationStagesOptions,
): Promise<ExecutedValidationStage> {
  const subprocessOutput = options.json ? createCapturedSubprocessOutput() : undefined;
  const stageStartTime = options.now();
  const participation = resolveStageParticipation(stage, options.participationOverrides);
  const stageResult = participation.participation === VALIDATION_STAGE_PARTICIPATION.RUN
    ? await stage.run({
      ...options.context,
      outputStreams: subprocessOutput?.streams ?? options.outputStreams,
    })
    : skippedStageResult(stage, participation, options.json, options.now() - stageStartTime);
  const result = stageResult.durationMs === undefined
    ? { ...stageResult, durationMs: options.now() - stageStartTime }
    : stageResult;
  return { result, subprocessOutput };
}

function notifyStageCompletion(
  stage: ValidationStage,
  result: ValidationCommandResult,
  stepNumber: number,
  options: ExecuteValidationStagesOptions,
): void {
  if (options.json || options.onStageComplete === undefined) return;
  const output = formatStepWithTiming(stepNumber, options.stages.length, stage.name, result, options.quiet);
  if (output.length === 0) return;
  options.onStageComplete({
    stepNumber,
    totalSteps: options.stages.length,
    stageName: stage.name,
    result,
    output,
  });
}

/**
 * Run all validation steps.
 *
 * @param options - Command options
 * @returns Command result with exit code and output
 */
export async function allCommand(
  options: AllCommandOptions,
  deps: AllCommandDependencies = {},
): Promise<ValidationCommandResult> {
  const {
    cwd,
    scope,
    files,
    fix,
    quiet = false,
    json,
    validationStages,
    participationOverrides = [],
    onStageComplete,
    outputStreams,
  } = options;
  const stages = resolveFullPipelineStages(validationStages, deps.stages);
  const now = deps.now ?? Date.now;
  const startTime = now();
  const outputs: string[] = [];
  const jsonSteps: AllValidationJsonStep[] = [];

  const context = {
    cwd,
    scope,
    files,
    fix,
    quiet: json === true ? false : quiet,
    json,
    outputStreams,
  };
  const hasFailure = await executeValidationStages({
    stages,
    context,
    participationOverrides: new Set(participationOverrides),
    json: json === true,
    quiet,
    outputs,
    jsonSteps,
    onStageComplete,
    outputStreams,
    writeOutput: deps.writeOutput,
    now,
  });

  // Calculate total duration
  const totalDurationMs = now() - startTime;

  if (json === true) {
    const jsonOutput: AllValidationJsonOutput = {
      success: !hasFailure,
      durationMs: totalDurationMs,
      steps: jsonSteps,
    };
    const output = JSON.stringify(jsonOutput);
    deps.writeOutput?.(output);
    return {
      exitCode: hasFailure ? 1 : 0,
      output,
      outputTarget: VALIDATION_OUTPUT_TARGET.STDOUT,
      durationMs: totalDurationMs,
    };
  }

  // Add summary line
  let terminalOutput: string | undefined;
  if (!quiet) {
    const summary = formatSummary({ success: !hasFailure, totalDurationMs });
    deps.writeOutput?.(`\n${summary}`);
    if (onStageComplete !== undefined) {
      terminalOutput = `\n${summary}`;
    } else {
      outputs.push("", summary); // Empty line before summary
    }
  }

  return {
    exitCode: hasFailure ? 1 : 0,
    output: outputs.join("\n"),
    terminalOutput,
    durationMs: totalDurationMs,
  };
}
