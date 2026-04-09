/**
 * ESLint validation command.
 *
 * Runs ESLint for code quality checks.
 */
import { getTypeScriptScope } from "../../validation/config/scope.js";
import { detectTypeScript, discoverTool, formatSkipMessage } from "../../validation/discovery/index.js";
import { validateESLint } from "../../validation/steps/eslint.js";
import type { ValidationContext } from "../../validation/types.js";
import type { LintCommandOptions, ValidationCommandResult } from "./types";

const TYPESCRIPT_ABSENT_MESSAGE = "⏭ Skipping ESLint (TypeScript not detected in project)";
const MISSING_CONFIG_MESSAGE =
  "ESLint config not found: project has tsconfig.json but no eslint.config.{ts,js,mjs,cjs}";

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
export async function lintCommand(options: LintCommandOptions): Promise<ValidationCommandResult> {
  const { cwd, scope = "full", files, fix, quiet } = options;
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

  // Gate 2: ESLint flat config must exist when TypeScript is present.
  if (tsDetection.eslintConfigFile === undefined) {
    return {
      exitCode: 1,
      output: MISSING_CONFIG_MESSAGE,
      durationMs: Date.now() - startTime,
    };
  }

  // Gate 3: tool discovery — ensure ESLint itself is available somewhere.
  const toolResult = await discoverTool("eslint", { projectRoot: cwd });
  if (!toolResult.found) {
    const skipMessage = formatSkipMessage("ESLint", toolResult);
    return { exitCode: 0, output: skipMessage, durationMs: Date.now() - startTime };
  }

  // Get scope configuration from tsconfig
  const scopeConfig = getTypeScriptScope(scope);

  // Build validation context
  const context: ValidationContext = {
    projectRoot: cwd,
    scope,
    scopeConfig,
    mode: fix ? "write" : "read",
    enabledValidations: { ESLINT: true },
    validatedFiles: files,
    isFileSpecificMode: Boolean(files && files.length > 0),
    eslintConfigFile: tsDetection.eslintConfigFile,
  };

  // Run ESLint validation
  const result = await validateESLint(context);
  const durationMs = Date.now() - startTime;

  // Map result to command output
  if (result.success) {
    const output = quiet ? "" : `ESLint: ✓ No issues found`;
    return { exitCode: 0, output, durationMs };
  } else {
    const output = result.error ?? "ESLint validation failed";
    return { exitCode: 1, output, durationMs };
  }
}
