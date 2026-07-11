/**
 * Shared types for validation commands.
 */
import type { ValidationStage } from "@/validation/languages/types";
import type { ValidationSubprocessOutputStreams } from "@/validation/steps/subprocess-output";
import type { ValidationScope } from "@/validation/types";

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
  /** Parent streams that receive TypeScript subprocess output */
  outputStreams?: ValidationSubprocessOutputStreams;
}

/** Options for lint command */
export interface LintCommandOptions extends CommonValidationOptions {
  /** Auto-fix issues */
  fix?: boolean;
  /** Parent streams that receive ESLint subprocess output */
  outputStreams?: ValidationSubprocessOutputStreams;
}

/** Options for circular command */
export type CircularCommandOptions = CommonValidationOptions;

/** Options for knip command */
export type KnipCommandOptions = CommonValidationOptions;

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
}

/** Options for all command */
export interface AllCommandOptions extends CommonValidationOptions {
  /** Auto-fix ESLint issues */
  fix?: boolean;
  /** Registered validation stages to run for this full-pipeline invocation. */
  validationStages?: readonly ValidationStage[];
  /** Invocation-local stage participation override flags selected by the CLI. */
  participationOverrides?: readonly `--${string}`[];
  /** Receives each visible stage line as soon as that stage completes. */
  writeStageOutput?: (output: string) => void;
  /** Parent streams that receive validation subprocess output. */
  outputStreams?: ValidationSubprocessOutputStreams;
}
