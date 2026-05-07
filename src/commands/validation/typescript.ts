/**
 * TypeScript validation command.
 *
 * Runs TypeScript type checking using tsc.
 */
import { getTypeScriptScope } from "@/validation/config/scope";
import { detectTypeScript, discoverTool, formatSkipMessage } from "@/validation/discovery/index";
import { validateTypeScript } from "@/validation/steps/typescript";
import {
  formatTypeScriptAbsentSkipMessage,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "./messages";
import type { TypeScriptCommandOptions, ValidationCommandResult } from "./types";

export const TYPESCRIPT_VALIDATION_MESSAGES = {
  ABSENT: formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT),
  SUCCESS: VALIDATION_COMMAND_OUTPUT.TYPESCRIPT_SUCCESS,
  TOOL_LABEL: VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT,
} as const;

/**
 * Run TypeScript type checking.
 *
 * Gates tsc execution on language detection: without a `tsconfig.json` in the
 * project root there is nothing to type-check, and invoking tsc regardless
 * causes it to walk up and compile an ancestor project instead.
 *
 * @param options - Command options
 * @returns Command result with exit code and output
 */
export async function typescriptCommand(options: TypeScriptCommandOptions): Promise<ValidationCommandResult> {
  const { cwd, scope = "full", files, quiet } = options;
  const startTime = Date.now();

  // Gate 1: language detection. No TypeScript = skip cleanly.
  const tsDetection = detectTypeScript(cwd);
  if (!tsDetection.present) {
    return {
      exitCode: 0,
      output: quiet ? "" : TYPESCRIPT_VALIDATION_MESSAGES.ABSENT,
      durationMs: Date.now() - startTime,
    };
  }

  // Gate 2: tool discovery — ensure tsc itself is available somewhere.
  const toolResult = await discoverTool("typescript", { projectRoot: cwd });
  if (!toolResult.found) {
    const skipMessage = formatSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT, toolResult);
    return { exitCode: 0, output: skipMessage, durationMs: Date.now() - startTime };
  }

  // Get scope configuration from tsconfig
  const scopeConfig = getTypeScriptScope(scope);

  // Run TypeScript validation
  const result = await validateTypeScript(scope, scopeConfig, files);
  const durationMs = Date.now() - startTime;

  // Map result to command output
  if (result.success) {
    const output = quiet ? "" : TYPESCRIPT_VALIDATION_MESSAGES.SUCCESS;
    return { exitCode: 0, output, durationMs };
  } else {
    const output = result.error ?? VALIDATION_COMMAND_OUTPUT.TYPESCRIPT_FAILURE;
    return { exitCode: 1, output, durationMs };
  }
}
