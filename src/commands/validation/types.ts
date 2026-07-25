/**
 * Shared types for validation commands.
 */
import { externalValue, joinTerminalText, type TerminalText } from "@/lib/terminal-text/terminal-text";
import type { ValidationStage } from "@/validation/languages/types";
import type { ValidationSubprocessOutputStreams } from "@/validation/steps/subprocess-output";
import type { ValidationScope } from "@/validation/types";

export const VALIDATION_OUTPUT_TARGET = {
  STDOUT: "stdout",
  STDERR: "stderr",
} as const;

export type ValidationOutputTarget = (typeof VALIDATION_OUTPUT_TARGET)[keyof typeof VALIDATION_OUTPUT_TARGET];

const VALIDATION_REPORT_LINE_SEPARATOR = "\n";

/**
 * Joins the lines of one stage report. The line structure is the product's own, so the separator
 * keeps its bytes while each segment keeps the escaping decision made where it was built. Empty
 * segments drop out, which is how a quiet stage or a silent tool contributes no line.
 */
export function validationReport(segments: readonly (TerminalText | undefined)[]): TerminalText {
  return joinTerminalText(
    VALIDATION_REPORT_LINE_SEPARATOR,
    segments.filter((segment): segment is TerminalText => segment !== undefined && segment.length > 0),
  );
}

/**
 * A tool's captured output as a report segment. The bytes came from tsc, eslint, knip, or dprint
 * rather than from this product, so they are escaped here — the point they enter a report spx
 * speaks. A tool that wrote nothing contributes no segment.
 */
export function capturedToolOutput(output: string | undefined): TerminalText | undefined {
  return output === undefined || output.length === 0 ? undefined : externalValue(output);
}

/**
 * Whether the stage's subprocess detail already reached the terminal through the pass-through
 * relay, so the pipeline reports a verdict for it instead of repeating the tool's output.
 */
export function streamedValidationDetail(
  subprocessOutput: string | undefined,
  json: boolean | undefined,
  streamedPipelineOutput: boolean | undefined,
): boolean {
  return json !== true && streamedPipelineOutput === true && subprocessOutput !== undefined
    && subprocessOutput.length > 0;
}

/** Result from a validation command */
export interface ValidationCommandResult {
  /** Exit code (0 = success, 1 = validation failed, 0 with skipped = tool unavailable) */
  exitCode: number;
  /** Aggregate text: the full-pipeline transcript and the JSON step payloads read this. */
  output: string;
  /**
   * The command's own terminal payload. A validation command never relays a foreign document —
   * every payload here is a report the product composed — so the tool output, caught error, and
   * discovered path it quotes are escaped where each is embedded while the product's own messages
   * keep their bytes. Composing at the producer is the only place both provenances are still
   * distinguishable; the write site sees one finished report.
   */
  terminalText: TerminalText;
  /** Duration in milliseconds (optional for backward compatibility) */
  durationMs?: number;
  /** Output is already a complete machine-readable record. */
  structuredOutput?: boolean;
  /** The stage streamed its subprocess detail; its terminal payload is a verdict, not that output. */
  streamedDetail?: boolean;
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
  readonly output: TerminalText;
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
