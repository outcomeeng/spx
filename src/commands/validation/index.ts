/**
 * Validation commands module.
 *
 * Exports all validation command handlers.
 */

// Types
export type {
  AllCommandOptions,
  CircularCommandOptions,
  CommonValidationOptions,
  FormattingCommandOptions,
  KnipCommandOptions,
  LintCommandOptions,
  MarkdownCommandOptions,
  TypeScriptCommandOptions,
  ValidationCommandResult,
} from "./types";

// Commands
export { allCommand } from "./all";
export { circularCommand } from "./circular";
export { FORMATTING_COMMAND_OUTPUT, formattingCommand } from "./formatting";
export { knipCommand } from "./knip";
export { lintCommand } from "./lint";
export { literalCommand } from "./literal";
export { markdownCommand } from "./markdown";
export {
  formatValidationStageSkipJsonOutput,
  formatValidationStageSkipOutput,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_EXIT_CODES,
  VALIDATION_SKIP_LABELS,
  VALIDATION_STAGE_DISPLAY_NAMES,
  VALIDATION_STEP_DURATION_PATTERN,
  VALIDATION_STEP_LINE_PATTERN,
} from "./messages";
export { VALIDATION_RUNTIME_ANTI_MARKERS } from "./runtime-diagnostics";
export { typescriptCommand } from "./typescript";

// Formatting utilities
export { DURATION_THRESHOLD_MS, formatDuration, formatStepOutput, formatSummary, VALIDATION_SYMBOLS } from "./format";
export type { FormatStepOptions, FormatSummaryOptions } from "./format";
