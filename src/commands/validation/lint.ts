/**
 * ESLint validation command.
 *
 * Runs ESLint for code quality checks.
 */
import { resolveConfig } from "@/config/index";
import {
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  type ValidationConfig,
  validationConfigDescriptor,
} from "@/validation/config/descriptor";
import { toProjectRelativeValidationPath, validationPathFilterForTool } from "@/validation/config/path-filter";
import {
  EXPLICIT_TYPESCRIPT_SCOPE_TARGET_KIND,
  filterExplicitTypeScriptScopeTargets,
  getTypeScriptScope,
  resolveTypeScriptValidationScope,
} from "@/validation/config/scope";
import { detectTypeScript, discoverTool, formatSkipMessage } from "@/validation/discovery/index";
import { validateESLint } from "@/validation/steps/eslint";
import { VALIDATION_SCOPES, type ValidationContext } from "@/validation/types";
import {
  formatTypeScriptAbsentSkipMessage,
  formatValidationPathsNoTargetsSkipMessage,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "./messages";
import type { LintCommandOptions, ValidationCommandResult } from "./types";

const TYPESCRIPT_ABSENT_MESSAGE = formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.ESLINT);
const MISSING_CONFIG_MESSAGE = VALIDATION_COMMAND_OUTPUT.ESLINT_MISSING_CONFIG;
const ESLINT_CONFIG_ERROR_MESSAGE = `${VALIDATION_STAGE_DISPLAY_NAMES.ESLINT}: ✗ config error`;
const VALIDATION_PATHS_NO_TARGETS_MESSAGE = formatValidationPathsNoTargetsSkipMessage(
  VALIDATION_STAGE_DISPLAY_NAMES.ESLINT,
);

export interface LintCommandDependencies {
  readonly detectTypeScript: typeof detectTypeScript;
  readonly discoverTool: typeof discoverTool;
  readonly resolveConfig: typeof resolveConfig;
  readonly validateESLint: typeof validateESLint;
}

const defaultLintCommandDependencies: LintCommandDependencies = {
  detectTypeScript,
  discoverTool,
  resolveConfig,
  validateESLint,
};

/**
 * Run ESLint validation.
 *
 * Gates ESLint execution on TypeScript language detection. ESLint runs only
 * when `tsconfig.json` is present AND an ESLint flat config file exists. A
 * project with `tsconfig.json` but no ESLint config produces a non-zero exit
 * with a descriptive error; a project without `tsconfig.json` skips cleanly.
 *
 * @param options - Command options
 * @returns Command result with exit code and output
 */
export async function lintCommand(
  options: LintCommandOptions,
  deps: LintCommandDependencies = defaultLintCommandDependencies,
): Promise<ValidationCommandResult> {
  const { cwd, scope = "full", files, fix, outputStreams, quiet } = options;
  const startTime = Date.now();

  // Gate 1: language detection. No TypeScript = skip cleanly.
  const tsDetection = deps.detectTypeScript(cwd);
  if (!tsDetection.present) {
    return {
      exitCode: 0,
      output: quiet ? "" : TYPESCRIPT_ABSENT_MESSAGE,
      durationMs: Date.now() - startTime,
    };
  }

  const eslintConfigFile = scope === VALIDATION_SCOPES.PRODUCTION
    ? tsDetection.productionEslintConfigFile ?? tsDetection.eslintConfigFile
    : tsDetection.eslintConfigFile;

  // Gate 2: ESLint flat config must exist when TypeScript is present.
  if (eslintConfigFile === undefined) {
    return {
      exitCode: 1,
      output: MISSING_CONFIG_MESSAGE,
      durationMs: Date.now() - startTime,
    };
  }

  const loaded = await deps.resolveConfig(cwd, [validationConfigDescriptor]);
  if (!loaded.ok) {
    return {
      exitCode: 1,
      output: `${ESLINT_CONFIG_ERROR_MESSAGE} — ${loaded.error}`,
      durationMs: Date.now() - startTime,
    };
  }
  const validationConfig = loaded.value[validationConfigDescriptor.section] as ValidationConfig;
  const validationPathFilter = validationPathFilterForTool(
    validationConfig.paths,
    VALIDATION_PATH_TOOL_SUBSECTIONS.ESLINT,
  );
  const explicitMode = files !== undefined && files.length > 0;
  const scopeConfig = resolveTypeScriptValidationScope({
    projectRoot: cwd,
    scope,
    paths: files,
    validationPathFilter,
    markExplicitPathsAsValidationFilter: explicitMode,
    bypassExplicitPathValidationFilter: true,
  });
  const explicitTargets = explicitMode
    ? filterExplicitTypeScriptScopeTargets({
      paths: files,
      projectRoot: cwd,
      validationPathFilter,
      scopeConfig: getTypeScriptScope(scope, cwd),
      bypassValidationPathFilter: true,
    })
    : undefined;
  const validatedFiles = explicitTargets?.every((target) => target.kind === EXPLICIT_TYPESCRIPT_SCOPE_TARGET_KIND.FILE)
    ? explicitTargets.map((target) => formatLintValidationOperand(toProjectRelativeValidationPath(cwd, target.path)))
    : undefined;

  if (scopeConfig.filteredByValidationPathNoMatches) {
    return {
      exitCode: 0,
      output: quiet ? "" : VALIDATION_PATHS_NO_TARGETS_MESSAGE,
      durationMs: Date.now() - startTime,
    };
  }

  // Gate 3: tool discovery — ensure ESLint itself is available somewhere.
  const toolResult = await deps.discoverTool("eslint", { projectRoot: cwd });
  if (!toolResult.found) {
    const skipMessage = formatSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.ESLINT, toolResult);
    return { exitCode: 0, output: skipMessage, durationMs: Date.now() - startTime };
  }

  // Build validation context
  const context: ValidationContext = {
    projectRoot: cwd,
    scope,
    scopeConfig,
    mode: fix ? "write" : "read",
    enabledValidations: { ESLINT: true },
    validatedFiles,
    validatedFileIgnorePatterns: undefined,
    isFileSpecificMode: Boolean(validatedFiles && validatedFiles.length > 0),
    eslintConfigFile,
  };

  // Run ESLint validation
  const result = await deps.validateESLint(context, undefined, outputStreams);
  const durationMs = Date.now() - startTime;

  return formatLintResult(result, quiet, durationMs);
}

function formatLintValidationOperand(path: string): string {
  return path.length === 0 ? "." : path;
}

function formatLintResult(
  result: Awaited<ReturnType<typeof validateESLint>>,
  quiet: boolean | undefined,
  durationMs: number,
): ValidationCommandResult {
  if (result.skipped) {
    const output = quiet ? "" : VALIDATION_PATHS_NO_TARGETS_MESSAGE;
    return { exitCode: 0, output, durationMs };
  }
  if (result.success) {
    const output = quiet ? "" : VALIDATION_COMMAND_OUTPUT.ESLINT_SUCCESS;
    return { exitCode: 0, output, durationMs };
  }
  const output = result.error ?? VALIDATION_COMMAND_OUTPUT.ESLINT_FAILURE;
  return { exitCode: 1, output, durationMs };
}
