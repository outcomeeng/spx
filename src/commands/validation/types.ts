/**
 * Shared types for validation commands.
 */
import type { ValidationStage } from "@/validation/languages/types";
import type { ValidationSubprocessOutputStreams } from "@/validation/steps/subprocess-output";
import type { ValidationScope } from "@/validation/types";

export const VALIDATION_OUTPUT_TARGET = {
  STDOUT: "stdout",
  STDERR: "stderr",
} as const;

export type ValidationOutputTarget = (typeof VALIDATION_OUTPUT_TARGET)[keyof typeof VALIDATION_OUTPUT_TARGET];

export const VALIDATION_STREAMED_TERMINAL_OUTPUT = "";

export function streamedValidationTerminalOutput(
  subprocessOutput: string | undefined,
  json: boolean | undefined,
  streamedPipelineOutput: boolean | undefined,
): string | undefined {
  return json !== true && streamedPipelineOutput === true && subprocessOutput !== undefined
      && subprocessOutput.length > 0
    ? VALIDATION_STREAMED_TERMINAL_OUTPUT
    : undefined;
}

/** Result from a validation command */
export interface ValidationCommandResult {
  /** Exit code (0 = success, 1 = validation failed, 0 with skipped = tool unavailable) */
  exitCode: number;
  /** Output to display */
  output: string;
  /** Duration in milliseconds (optional for backward compatibility) */
  durationMs?: number;
  /** Output is already a complete machine-readable record. */
  structuredOutput?: boolean;
  /** Output the CLI boundary emits when subprocess detail was already streamed. */
  terminalOutput?: string;
  /** Terminal stream that receives the command payload. */
  outputTarget?: ValidationOutputTarget;
}

export const ALL_VALIDATION_JSON_FIELD = {
  SUCCESS: "success",
  DURATION_MS: "durationMs",
  STEPS: "steps",
  NAME: "name",
  EXIT_CODE: "exitCode",
  OUTPUT: "output",
  STDOUT: "stdout",
  STDERR: "stderr",
} as const;

export interface AllValidationJsonStep {
  readonly name: string;
  readonly exitCode: number;
  readonly durationMs?: number;
  readonly output: unknown;
  readonly stdout: string;
  readonly stderr: string;
}

export interface AllValidationJsonOutput {
  readonly success: boolean;
  readonly durationMs: number;
  readonly steps: readonly AllValidationJsonStep[];
}

export interface ValidationStageCompletion {
  readonly stepNumber: number;
  readonly totalSteps: number;
  readonly stageName: string;
  readonly result: ValidationCommandResult;
  readonly output: string;
}

/** Common options for all validation commands */
export interface CommonValidationOptions {
  /** Working directory */
  cwd: string;
  /** Validation scope */
  scope?: ValidationScope;
  /** Specific files to validate */
  files?: string[];
  /** Suppress progress output */
  quiet?: boolean;
  /** Output as JSON */
  json?: boolean;
}

/** Options for TypeScript command */
export interface TypeScriptCommandOptions extends CommonValidationOptions {
  /** Report a stage verdict after subprocess detail streamed through the full pipeline. */
  streamedPipelineOutput?: boolean;
  /** Parent streams that receive TypeScript subprocess output */
  outputStreams?: ValidationSubprocessOutputStreams;
}

/** Options for lint command */
export interface LintCommandOptions extends CommonValidationOptions {
  /** Auto-fix issues */
  fix?: boolean;
  /** Report a stage verdict after subprocess detail streamed through the full pipeline. */
  streamedPipelineOutput?: boolean;
  /** Parent streams that receive ESLint subprocess output */
  outputStreams?: ValidationSubprocessOutputStreams;
}

/** Options for circular command */
export type CircularCommandOptions = CommonValidationOptions;

/** Options for knip command */
export interface KnipCommandOptions extends CommonValidationOptions {
  /** Report a stage verdict after subprocess detail streamed through the full pipeline. */
  streamedPipelineOutput?: boolean;
  /** Parent streams that receive Knip subprocess output. */
  outputStreams?: ValidationSubprocessOutputStreams;
}

/** Options for markdown command */
export interface MarkdownCommandOptions {
  cwd: string;
  files?: string[];
  quiet?: boolean;
}

/** Options for formatting command */
export interface FormattingCommandOptions {
  cwd: string;
  files?: string[];
  quiet?: boolean;
  /** Output as JSON when composed into the full validation pipeline. */
  json?: boolean;
  /** Report a stage verdict after subprocess detail streamed through the full pipeline. */
  streamedPipelineOutput?: boolean;
  /** Parent streams that receive dprint subprocess output. */
  outputStreams?: ValidationSubprocessOutputStreams;
}

/** Options for all command */
export interface AllCommandOptions extends CommonValidationOptions {
  /** Auto-fix ESLint issues */
  fix?: boolean;
  /** Registered validation stages to run for this full-pipeline invocation. */
  validationStages?: readonly ValidationStage[];
  /** Invocation-local stage participation override flags selected by the CLI. */
  participationOverrides?: readonly `--${string}`[];
  /** Receives each visible stage completion as soon as that stage completes. */
  onStageComplete?: (completion: ValidationStageCompletion) => void;
  /** Parent streams that receive validation subprocess output. */
  outputStreams?: ValidationSubprocessOutputStreams;
}
