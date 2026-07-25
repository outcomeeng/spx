/**
 * Knip command for detecting unused code.
 *
 * Runs knip to find unused exports, dependencies, and files.
 */
import { resolveConfig } from "@/config/index";
import { authoredText, externalValue, terminal } from "@/lib/terminal-text/terminal-text";
import {
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  type ValidationConfig,
  validationConfigDescriptor,
} from "@/validation/config/descriptor";
import { validationPathFilterForTool } from "@/validation/config/path-filter";
import { resolveTypeScriptValidationScope } from "@/validation/config/scope";
import { detectTypeScript, discoverTool, formatSkipMessage } from "@/validation/discovery/index";
import { KNIP_COMMAND_TOKENS, validateKnip } from "@/validation/steps/knip";
import { discardValidationSubprocessOutputStreams } from "@/validation/steps/subprocess-output";
import { VALIDATION_SCOPES } from "@/validation/types";
import {
  formatTypeScriptAbsentSkipMessage,
  formatValidationScopeNoTargetsSkipMessage,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "./messages";
import {
  capturedToolOutput,
  type KnipCommandOptions,
  streamedValidationDetail,
  type ValidationCommandResult,
  validationReport,
} from "./types";

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
  const {
    cwd,
    files,
    json,
    outputStreams,
    quiet,
    scope = VALIDATION_SCOPES.FULL,
    streamedPipelineOutput,
  } = options;
  const startTime = Date.now();

  if (!deps.detectTypeScript(cwd).present) {
    const output = quiet ? "" : KNIP_TYPESCRIPT_ABSENT_MESSAGE;
    return {
      exitCode: 0,
      output,
      terminalText: authoredText(output),
      durationMs: Date.now() - startTime,
    };
  }

  const loaded = await resolveConfig(cwd, [validationConfigDescriptor]);
  if (!loaded.ok) {
    return {
      exitCode: 1,
      output: `${VALIDATION_COMMAND_OUTPUT.KNIP_CONFIG_ERROR} — ${loaded.error}`,
      terminalText: terminal`${authoredText(VALIDATION_COMMAND_OUTPUT.KNIP_CONFIG_ERROR)} — ${
        externalValue(loaded.error)
      }`,
      durationMs: Date.now() - startTime,
    };
  }
  const validationConfig = loaded.value[validationConfigDescriptor.section] as ValidationConfig;

  if (!validationConfig.knip.enabled) {
    const output = quiet ? "" : VALIDATION_COMMAND_OUTPUT.KNIP_DISABLED;
    return { exitCode: 0, output, terminalText: authoredText(output), durationMs: Date.now() - startTime };
  }

  // Discover knip
  const toolResult = await deps.discoverTool(KNIP_COMMAND_TOKENS.COMMAND, {
    productDir: cwd,
    includeBundled: false,
  });
  if (!toolResult.found) {
    const skipMessage = formatSkipMessage(KNIP_VALIDATION_STEP_NAME, toolResult);
    return {
      exitCode: 0,
      output: skipMessage,
      terminalText: authoredText(skipMessage),
      durationMs: Date.now() - startTime,
    };
  }

  const scopeConfig = resolveTypeScriptValidationScope({
    productDir: cwd,
    scope,
    paths: files,
    validationPathFilter: validationPathFilterForTool(validationConfig.paths, VALIDATION_PATH_TOOL_SUBSECTIONS.KNIP),
    markExplicitPathsAsValidationFilter: true,
  });
  const noTargetsMessage = formatValidationScopeNoTargetsSkipMessage(
    VALIDATION_STAGE_DISPLAY_NAMES.KNIP,
    scopeConfig,
  );
  if (noTargetsMessage !== undefined) {
    const output = quiet ? "" : noTargetsMessage;
    return {
      exitCode: 0,
      output,
      terminalText: authoredText(output),
      durationMs: Date.now() - startTime,
    };
  }

  // Run knip validation
  const result = await deps.validateKnip(
    {
      productDir: cwd,
      typescriptScope: scopeConfig,
      toolPath: toolResult.location.path,
    },
    undefined,
    undefined,
    outputStreams ?? discardValidationSubprocessOutputStreams,
  );
  const durationMs = Date.now() - startTime;

  return formatKnipResult(result, quiet, durationMs, json, streamedPipelineOutput);
}

function formatKnipResult(
  result: Awaited<ReturnType<typeof validateKnip>>,
  quiet: boolean | undefined,
  durationMs: number,
  json: boolean | undefined,
  streamedPipelineOutput: boolean | undefined,
): ValidationCommandResult {
  if (result.success) {
    const output = quiet
      ? ""
      : [VALIDATION_COMMAND_OUTPUT.KNIP_SUCCESS, result.output].filter((line) => line !== undefined && line.length > 0)
        .join("\n");
    const terminalText = quiet ? authoredText("") : validationReport([
      authoredText(VALIDATION_COMMAND_OUTPUT.KNIP_SUCCESS),
      capturedToolOutput(result.output),
    ]);
    const streamedDetail = streamedValidationDetail(result.output, json, streamedPipelineOutput);
    return { exitCode: 0, output, terminalText, streamedDetail, durationMs };
  }
  const output = result.error ?? VALIDATION_COMMAND_OUTPUT.KNIP_FAILURE;
  const terminalText = result.error === undefined
    ? authoredText(VALIDATION_COMMAND_OUTPUT.KNIP_FAILURE)
    : externalValue(result.error);
  const streamedDetail = streamedValidationDetail(result.error, json, streamedPipelineOutput);
  return { exitCode: 1, output, terminalText, streamedDetail, durationMs };
}
