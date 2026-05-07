/**
 * Shared types for validation commands.
 */
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

/** Options for TypeScript command (same as common options) */
export type TypeScriptCommandOptions = CommonValidationOptions;

/** Options for lint command */
export interface LintCommandOptions extends CommonValidationOptions {
  /** Auto-fix issues */
  fix?: boolean;
  /** Parent streams that receive ESLint subprocess output */
  outputStreams?: ValidationSubprocessOutputStreams;
}

/** Options for circular command */
export interface CircularCommandOptions {
  cwd: string;
  quiet?: boolean;
  json?: boolean;
}

/** Options for knip command */
export interface KnipCommandOptions {
  cwd: string;
  quiet?: boolean;
  json?: boolean;
}

/** Options for markdown command */
export interface MarkdownCommandOptions {
  cwd: string;
  files?: string[];
  quiet?: boolean;
}

/** Options for all command */
export interface AllCommandOptions extends CommonValidationOptions {
  /** Auto-fix ESLint issues */
  fix?: boolean;
  /** Skip literal reuse detection for this full-pipeline run */
  skipLiteral?: boolean;
}
