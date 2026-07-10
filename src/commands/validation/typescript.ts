/**
 * TypeScript validation command.
 *
 * Runs TypeScript type checking using tsc.
 */
import { resolveConfig } from "@/config/index";
import {
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  type ValidationConfig,
  validationConfigDescriptor,
} from "@/validation/config/descriptor";
import { validationPathFilterForTool } from "@/validation/config/path-filter";
import { resolveTypeScriptValidationScope } from "@/validation/config/scope";
import { detectTypeScript, discoverTool, formatSkipMessage } from "@/validation/discovery/index";
import { validateTypeScript } from "@/validation/steps/typescript";
import {
  formatTypeScriptAbsentSkipMessage,
  formatValidationPathsNoTargetsSkipMessage,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "./messages";
import type { TypeScriptCommandOptions, ValidationCommandResult } from "./types";

export const TYPESCRIPT_VALIDATION_MESSAGES = {
  ABSENT: formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT),
  CONFIG_ERROR: `${VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT}: ✗ config error`,
  NO_VALIDATION_PATH_TARGETS: formatValidationPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT),
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
  const { cwd, scope = "full", files, outputStreams, quiet } = options;
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

  const loaded = await resolveConfig(cwd, [validationConfigDescriptor]);
  if (!loaded.ok) {
    return {
      exitCode: 1,
      output: `${TYPESCRIPT_VALIDATION_MESSAGES.CONFIG_ERROR} — ${loaded.error}`,
      durationMs: Date.now() - startTime,
    };
  }
  const validationConfig = loaded.value[validationConfigDescriptor.section] as ValidationConfig;
  const scopeConfig = resolveTypeScriptValidationScope({
    projectRoot: cwd,
    scope,
    paths: files,
    validationPathFilter: validationPathFilterForTool(
      validationConfig.paths,
      VALIDATION_PATH_TOOL_SUBSECTIONS.TYPESCRIPT,
    ),
    markExplicitPathsAsValidationFilter: true,
    bypassExplicitPathValidationFilter: true,
  });

  if (scopeConfig.filteredByValidationPathNoMatches) {
    return {
      exitCode: 0,
      output: quiet ? "" : TYPESCRIPT_VALIDATION_MESSAGES.NO_VALIDATION_PATH_TARGETS,
      durationMs: Date.now() - startTime,
    };
  }

  // Gate 2: tool discovery — ensure tsc itself is available somewhere.
  const toolResult = await discoverTool("typescript", { projectRoot: cwd });
  if (!toolResult.found) {
    const skipMessage = formatSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT, toolResult);
    return { exitCode: 0, output: skipMessage, durationMs: Date.now() - startTime };
  }

  const result = await validateTypeScript({
    scope,
    projectRoot: cwd,
    scopeConfig,
  }, {
    outputStreams,
  });
  const durationMs = Date.now() - startTime;

  return formatTypeScriptResult(result, quiet, durationMs);
}

function formatTypeScriptResult(
  result: Awaited<ReturnType<typeof validateTypeScript>>,
  quiet: boolean | undefined,
  durationMs: number,
): ValidationCommandResult {
  if (result.skipped) {
    const output = quiet ? "" : TYPESCRIPT_VALIDATION_MESSAGES.NO_VALIDATION_PATH_TARGETS;
    return { exitCode: 0, output, durationMs };
  }
  if (result.success) {
    const output = quiet ? "" : TYPESCRIPT_VALIDATION_MESSAGES.SUCCESS;
    return { exitCode: 0, output, durationMs };
  }
  const output = result.error ?? VALIDATION_COMMAND_OUTPUT.TYPESCRIPT_FAILURE;
  return { exitCode: 1, output, durationMs };
}
