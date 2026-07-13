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
import {
  detectTypeScript,
  discoverTool,
  formatSkipMessage,
  TOOL_DISCOVERY_PRIORITY,
} from "@/validation/discovery/index";
import { discardValidationSubprocessOutputStreams } from "@/validation/steps/subprocess-output";
import { validateTypeScript } from "@/validation/steps/typescript";
import {
  formatExplicitPathsNoTargetsSkipMessage,
  formatTypeScriptAbsentSkipMessage,
  formatValidationConfigProblemMessage,
  formatValidationPathsNoTargetsSkipMessage,
  formatValidationScopeNoTargetsSkipMessage,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "./messages";
import { streamedValidationTerminalOutput, type TypeScriptCommandOptions, type ValidationCommandResult } from "./types";

export interface TypeScriptCommandDeps {
  readonly detectTypeScript: typeof detectTypeScript;
  readonly discoverTool: typeof discoverTool;
  readonly validateTypeScript: typeof validateTypeScript;
}

export const defaultTypeScriptCommandDeps: TypeScriptCommandDeps = {
  detectTypeScript,
  discoverTool,
  validateTypeScript,
};

export const TYPESCRIPT_VALIDATION_MESSAGES = {
  ABSENT: formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT),
  CONFIG_ERROR: formatValidationConfigProblemMessage(
    VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT,
    "configuration error",
  ),
  NO_VALIDATION_PATH_TARGETS: formatValidationPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT),
  NO_EXPLICIT_PATH_TARGETS: formatExplicitPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT),
  SUCCESS: VALIDATION_COMMAND_OUTPUT.TYPESCRIPT_SUCCESS,
  TOOL_LABEL: VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT,
} as const;

export const TYPESCRIPT_TOOL_DISCOVERY = {
  TOOL: "typescript",
  EXECUTABLE_NAME: "tsc",
  BUNDLED_EXECUTABLE: "typescript/bin/tsc",
  PRODUCT_EXECUTABLE_SEGMENTS: ["node_modules", ".bin", "tsc"],
} as const;

/**
 * Run TypeScript type checking.
 *
 * Gates tsc execution on language detection: without a `tsconfig.json` in the
 * product directory there is nothing to type-check, and invoking tsc regardless
 * causes it to walk up and compile an ancestor project instead.
 *
 * @param options - Command options
 * @returns Command result with exit code and output
 */
export async function typescriptCommand(
  options: TypeScriptCommandOptions,
  deps: TypeScriptCommandDeps = defaultTypeScriptCommandDeps,
): Promise<ValidationCommandResult> {
  const { cwd, scope = "full", files, json, outputStreams, quiet, streamedPipelineOutput } = options;
  const startTime = Date.now();

  // Gate 1: language detection. No TypeScript = skip cleanly.
  const tsDetection = deps.detectTypeScript(cwd);
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
    productDir: cwd,
    scope,
    paths: files,
    validationPathFilter: validationPathFilterForTool(
      validationConfig.paths,
      VALIDATION_PATH_TOOL_SUBSECTIONS.TYPESCRIPT,
    ),
    markExplicitPathsAsValidationFilter: true,
    bypassExplicitPathValidationFilter: true,
  });

  const noTargetsMessage = formatValidationScopeNoTargetsSkipMessage(
    VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT,
    scopeConfig,
  );
  if (noTargetsMessage !== undefined) {
    return {
      exitCode: 0,
      output: quiet ? "" : noTargetsMessage,
      durationMs: Date.now() - startTime,
    };
  }

  // Gate 2: tool discovery — ensure tsc itself is available somewhere.
  const toolResult = await deps.discoverTool(TYPESCRIPT_TOOL_DISCOVERY.TOOL, {
    productDir: cwd,
    executableName: TYPESCRIPT_TOOL_DISCOVERY.EXECUTABLE_NAME,
    bundledExecutable: TYPESCRIPT_TOOL_DISCOVERY.BUNDLED_EXECUTABLE,
    priority: TOOL_DISCOVERY_PRIORITY.PRODUCT_FIRST,
  });
  if (!toolResult.found) {
    const skipMessage = formatSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT, toolResult);
    return { exitCode: 0, output: skipMessage, durationMs: Date.now() - startTime };
  }

  const result = await deps.validateTypeScript({
    scope,
    productDir: cwd,
    scopeConfig,
  }, {
    toolPath: toolResult.location.path,
    outputStreams: outputStreams ?? discardValidationSubprocessOutputStreams,
  });
  const durationMs = Date.now() - startTime;

  return formatTypeScriptResult(result, quiet, durationMs, json, streamedPipelineOutput);
}

function formatTypeScriptResult(
  result: Awaited<ReturnType<typeof validateTypeScript>>,
  quiet: boolean | undefined,
  durationMs: number,
  json: boolean | undefined,
  streamedPipelineOutput: boolean | undefined,
): ValidationCommandResult {
  if (result.skipped) {
    const output = quiet ? "" : TYPESCRIPT_VALIDATION_MESSAGES.NO_VALIDATION_PATH_TARGETS;
    return { exitCode: 0, output, durationMs };
  }
  if (result.success) {
    const output = quiet
      ? ""
      : [TYPESCRIPT_VALIDATION_MESSAGES.SUCCESS, result.output].filter((line) => line !== undefined && line.length > 0)
        .join("\n");
    const terminalOutput = streamedValidationTerminalOutput(result.output, json, streamedPipelineOutput);
    return { exitCode: 0, output, terminalOutput, durationMs };
  }
  const output = [result.output, result.error ?? VALIDATION_COMMAND_OUTPUT.TYPESCRIPT_FAILURE]
    .filter((line) => line !== undefined && line.length > 0)
    .join("\n");
  const terminalOutput = streamedValidationTerminalOutput(result.output, json, streamedPipelineOutput);
  return { exitCode: 1, output, terminalOutput, durationMs };
}
