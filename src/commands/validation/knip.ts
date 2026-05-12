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
import { applyValidationPathFilterToScope, validationPathFilterForTool } from "@/validation/config/path-filter";
import { getTypeScriptScope } from "@/validation/config/scope";
import { discoverTool, formatSkipMessage } from "@/validation/discovery/index";
import { validateKnip } from "@/validation/steps/knip";
import { VALIDATION_COMMAND_OUTPUT } from "./messages";
import type { KnipCommandOptions, ValidationCommandResult } from "./types";

/**
 * Detect unused code with knip.
 *
 * @param options - Command options
 * @returns Command result with exit code and output
 */
export async function knipCommand(options: KnipCommandOptions): Promise<ValidationCommandResult> {
  const { cwd, quiet } = options;
  const startTime = Date.now();

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
  const toolResult = await discoverTool("knip", { projectRoot: cwd });
  if (!toolResult.found) {
    const skipMessage = formatSkipMessage("unused code detection", toolResult);
    return { exitCode: 0, output: skipMessage, durationMs: Date.now() - startTime };
  }

  const scopeConfig = applyValidationPathFilterToScope(
    getTypeScriptScope("full", cwd),
    validationPathFilterForTool(validationConfig.paths, VALIDATION_PATH_TOOL_SUBSECTIONS.KNIP),
  );

  // Run knip validation
  const result = await validateKnip({ projectRoot: cwd, typescriptScope: scopeConfig });
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
