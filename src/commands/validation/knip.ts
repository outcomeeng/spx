/**
 * Knip command for detecting unused code.
 *
 * Runs knip to find unused exports, dependencies, and files.
 * Disabled by default - enable with KNIP_VALIDATION_ENABLED=1.
 */
import { getTypeScriptScope } from "@/validation/config/scope";
import { discoverTool, formatSkipMessage } from "@/validation/discovery/index";
import { validationEnabled } from "@/validation/steps/eslint";
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

  // Knip is disabled by default - check if explicitly enabled
  if (!validationEnabled("KNIP", { KNIP: false })) {
    const output = quiet ? "" : VALIDATION_COMMAND_OUTPUT.KNIP_DISABLED;
    return { exitCode: 0, output, durationMs: Date.now() - startTime };
  }

  // Discover knip
  const toolResult = await discoverTool("knip", { projectRoot: cwd });
  if (!toolResult.found) {
    const skipMessage = formatSkipMessage("unused code detection", toolResult);
    return { exitCode: 0, output: skipMessage, durationMs: Date.now() - startTime };
  }

  // Get scope configuration from tsconfig (knip uses full scope)
  const scopeConfig = getTypeScriptScope("full");

  // Run knip validation
  const result = await validateKnip(scopeConfig);
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
