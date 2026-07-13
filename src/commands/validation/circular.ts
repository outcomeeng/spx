/**
 * Circular dependency check command.
 *
 * Runs dependency-cruiser to detect circular dependencies.
 */
import { resolveConfig } from "@/config/index";
import {
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  type ValidationConfig,
  validationConfigDescriptor,
} from "@/validation/config/descriptor";
import { validationPathFilterForTool } from "@/validation/config/path-filter";
import { resolveTypeScriptValidationScope } from "@/validation/config/scope";
import { detectTypeScript } from "@/validation/discovery/index";
import { validateCircularDependencies } from "@/validation/steps/circular";
import { VALIDATION_SCOPES } from "@/validation/types";
import {
  formatTypeScriptAbsentSkipMessage,
  formatValidationConfigProblemMessage,
  formatValidationScopeNoTargetsSkipMessage,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "./messages";
import type { CircularCommandOptions, ValidationCommandResult } from "./types";

type CircularValidationResult = Awaited<ReturnType<typeof validateCircularDependencies>>;

const TYPESCRIPT_ABSENT_MESSAGE = formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR);
const CIRCULAR_CONFIG_ERROR_MESSAGE = formatValidationConfigProblemMessage(
  VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR,
  "configuration error",
);
export const CIRCULAR_DEPENDENCY_OUTPUT = {
  FOUND: VALIDATION_COMMAND_OUTPUT.CIRCULAR_FOUND,
} as const;

export interface CircularCommandDeps {
  readonly validateCircularDependencies: typeof validateCircularDependencies;
}

export const defaultCircularCommandDeps: CircularCommandDeps = {
  validateCircularDependencies,
};

function formatCircularValidationResult(result: CircularValidationResult, quiet: boolean): {
  readonly exitCode: number;
  readonly output: string;
} {
  if (result.success) {
    return {
      exitCode: 0,
      output: quiet ? "" : VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND,
    };
  }

  if (result.circularDependencies && result.circularDependencies.length > 0) {
    const cycles = result.circularDependencies
      .map((cycle) => `  ${cycle.join(" → ")}`)
      .join("\n");
    return {
      exitCode: 1,
      output: `${CIRCULAR_DEPENDENCY_OUTPUT.FOUND}:\n${cycles}`,
    };
  }

  return {
    exitCode: 1,
    output: result.error ?? CIRCULAR_DEPENDENCY_OUTPUT.FOUND,
  };
}

/**
 * Check for circular dependencies.
 *
 * Gates dependency-cruiser execution on TypeScript language detection:
 * dependency-cruiser walks the TypeScript import graph and has nothing to
 * examine in non-TypeScript products.
 *
 * @param options - Command options
 * @returns Command result with exit code and output
 */
export async function circularCommand(
  options: CircularCommandOptions,
  deps: CircularCommandDeps = defaultCircularCommandDeps,
): Promise<ValidationCommandResult> {
  const { cwd, files, quiet, scope = VALIDATION_SCOPES.FULL } = options;
  const startTime = Date.now();

  // Gate 1: language detection. No TypeScript = skip cleanly.
  const tsDetection = detectTypeScript(cwd);
  if (!tsDetection.present) {
    return {
      exitCode: 0,
      output: quiet ? "" : TYPESCRIPT_ABSENT_MESSAGE,
      durationMs: Date.now() - startTime,
    };
  }

  const loaded = await resolveConfig(cwd, [validationConfigDescriptor]);
  if (!loaded.ok) {
    return {
      exitCode: 1,
      output: `${CIRCULAR_CONFIG_ERROR_MESSAGE} — ${loaded.error}`,
      durationMs: Date.now() - startTime,
    };
  }
  const validationConfig = loaded.value[validationConfigDescriptor.section] as ValidationConfig;
  const effectiveScopeConfig = resolveTypeScriptValidationScope({
    productDir: cwd,
    scope,
    paths: files,
    validationPathFilter: validationPathFilterForTool(
      validationConfig.paths,
      VALIDATION_PATH_TOOL_SUBSECTIONS.CIRCULAR,
    ),
    bypassExplicitPathValidationFilter: true,
  });
  const noTargetsMessage = formatValidationScopeNoTargetsSkipMessage(
    VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR,
    effectiveScopeConfig,
  );
  if (noTargetsMessage !== undefined) {
    return {
      exitCode: 0,
      output: quiet ? "" : noTargetsMessage,
      durationMs: Date.now() - startTime,
    };
  }

  // Run circular dependency validation
  const result = await deps.validateCircularDependencies(scope, effectiveScopeConfig, cwd);
  const durationMs = Date.now() - startTime;
  return { ...formatCircularValidationResult(result, quiet === true), durationMs };
}
