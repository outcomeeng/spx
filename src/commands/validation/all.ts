/**
 * Run all validations command.
 *
 * Iterates the language registry, executing each composed validation stage in
 * registry order and reporting every stage's result. Stage participation and
 * step count derive entirely from the registry — no stage is dispatched by name.
 */
import type { ValidationStage } from "@/validation/languages/types";
import { validationPipelineStages } from "@/validation/registry";
import type { ValidationSubprocessOutputStreams, ValidationWritableStream } from "@/validation/steps/subprocess-output";
import { formatDuration, formatSummary } from "./format";
import type {
  AllCommandOptions,
  AllValidationJsonOutput,
  AllValidationJsonStep,
  ValidationCommandResult,
} from "./types";

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

  const stepOutput = formatStepWithTiming(stepNumber, totalSteps, result, quiet);
  if (stepOutput) {
    outputs.push(stepOutput);
    writeOutput?.(stepOutput);
  }
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
  const { cwd, scope, files, fix, quiet = false, json, skipCircular = false, skipLiteral = false } = options;
  const stages = deps.stages ?? validationPipelineStages;
  const now = deps.now ?? Date.now;
  const startTime = now();
  const outputs: string[] = [];
  const jsonSteps: AllValidationJsonStep[] = [];
  let hasFailure = false;

  const context = {
    cwd,
    scope,
    files,
    fix,
    quiet: json === true ? false : quiet,
    json,
    skipCircular,
    skipLiteral,
  };

  let stepNumber = 0;
  for (const stage of stages) {
    stepNumber += 1;
    const subprocessOutput = json === true ? createCapturedSubprocessOutput() : undefined;
    const result = await stage.run({ ...context, outputStreams: subprocessOutput?.streams });
    recordStageResult({
      json: json === true,
      stepNumber,
      totalSteps: stages.length,
      stage,
      result,
      quiet,
      outputs,
      jsonSteps,
      subprocessOutput,
      writeOutput: deps.writeOutput,
    });
    if (stage.failsPipeline && result.exitCode !== 0) hasFailure = true;
  }

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
      durationMs: totalDurationMs,
    };
  }

  // Add summary line
  if (!quiet) {
    const summary = formatSummary({ success: !hasFailure, totalDurationMs });
    outputs.push("", summary); // Empty line before summary
    deps.writeOutput?.(`\n${summary}`);
  }

  return {
    exitCode: hasFailure ? 1 : 0,
    output: outputs.join("\n"),
    durationMs: totalDurationMs,
  };
}
