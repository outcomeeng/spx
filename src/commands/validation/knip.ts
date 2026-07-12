/**
 * Knip command for detecting unused code.
 *
 * Runs knip to find unused exports, dependencies, and files.
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
import { KNIP_COMMAND_TOKENS, validateKnip } from "@/validation/steps/knip";
import { VALIDATION_SCOPES } from "@/validation/types";
import {
  formatTypeScriptAbsentSkipMessage,
  formatValidationPathsNoTargetsSkipMessage,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "./messages";
import type { KnipCommandOptions, ValidationCommandResult } from "./types";

export interface KnipCommandDeps {
  readonly detectTypeScript: typeof detectTypeScript;
  readonly discoverTool: typeof discoverTool;
  readonly validateKnip: typeof validateKnip;
}

export const defaultKnipCommandDeps: KnipCommandDeps = {
  detectTypeScript,
  discoverTool,
  validateKnip,
};
export const KNIP_VALIDATION_STEP_NAME = "unused code detection";
const KNIP_VALIDATION_PATHS_NO_TARGETS_MESSAGE = formatValidationPathsNoTargetsSkipMessage(
  VALIDATION_STAGE_DISPLAY_NAMES.KNIP,
);
const KNIP_TYPESCRIPT_ABSENT_MESSAGE = formatTypeScriptAbsentSkipMessage(
  VALIDATION_STAGE_DISPLAY_NAMES.KNIP,
);

/**
 * Detect unused code with knip.
 *
 * @param options - Command options
 * @returns Command result with exit code and output
 */
export async function knipCommand(
  options: KnipCommandOptions,
  deps: KnipCommandDeps = defaultKnipCommandDeps,
): Promise<ValidationCommandResult> {
  const { cwd, files, quiet, scope = VALIDATION_SCOPES.FULL } = options;
  const startTime = Date.now();

  if (!deps.detectTypeScript(cwd).present) {
    return {
      exitCode: 0,
      output: quiet ? "" : KNIP_TYPESCRIPT_ABSENT_MESSAGE,
      durationMs: Date.now() - startTime,
    };
  }

  const loaded = await resolveConfig(cwd, [validationConfigDescriptor]);
  if (!loaded.ok) {
    return {
      exitCode: 1,
      output: `${VALIDATION_COMMAND_OUTPUT.KNIP_CONFIG_ERROR} — ${loaded.error}`,
      durationMs: Date.now() - startTime,
    };
  }
  const validationConfig = loaded.value[validationConfigDescriptor.section] as ValidationConfig;

  if (!validationConfig.knip.enabled) {
    const output = quiet ? "" : VALIDATION_COMMAND_OUTPUT.KNIP_DISABLED;
    return { exitCode: 0, output, durationMs: Date.now() - startTime };
  }

  // Discover knip
  const toolResult = await deps.discoverTool(KNIP_COMMAND_TOKENS.COMMAND, {
    productDir: cwd,
    includeBundled: false,
  });
  if (!toolResult.found) {
    const skipMessage = formatSkipMessage(KNIP_VALIDATION_STEP_NAME, toolResult);
    return { exitCode: 0, output: skipMessage, durationMs: Date.now() - startTime };
  }

  const scopeConfig = resolveTypeScriptValidationScope({
    productDir: cwd,
    scope,
    paths: files,
    validationPathFilter: validationPathFilterForTool(validationConfig.paths, VALIDATION_PATH_TOOL_SUBSECTIONS.KNIP),
    markExplicitPathsAsValidationFilter: true,
    bypassExplicitPathValidationFilter: true,
  });
  if (scopeConfig.filteredByValidationPathNoMatches) {
    return {
      exitCode: 0,
      output: quiet ? "" : KNIP_VALIDATION_PATHS_NO_TARGETS_MESSAGE,
      durationMs: Date.now() - startTime,
    };
  }

  // Run knip validation
  const result = await deps.validateKnip({
    productDir: cwd,
    typescriptScope: scopeConfig,
    toolPath: toolResult.location.path,
  });
  const durationMs = Date.now() - startTime;

  // Map result to command output
  if (result.success) {
    const output = quiet ? "" : VALIDATION_COMMAND_OUTPUT.KNIP_SUCCESS;
    return { exitCode: 0, output, durationMs };
  } else {
    const output = result.error ?? VALIDATION_COMMAND_OUTPUT.KNIP_FAILURE;
    return { exitCode: 1, output, durationMs };
  }
}
