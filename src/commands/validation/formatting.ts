/**
 * Formatting validation command.
 *
 * Runs dprint in check mode for code formatting. Like markdown validation,
 * dprint is an always-present tool with no discovery or skip path. Participation
 * and explicit file scope derive from the resolved `spx.config.*` validation
 * configuration, never from process environment.
 */

import { existsSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

import { resolveConfig } from "@/config/index";
import { normalizePathPrefix } from "@/config/primitives/path-filter";
import {
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  type ValidationConfig,
  validationConfigDescriptor,
} from "@/validation/config/descriptor";
import {
  pathPassesValidationFilter,
  validationPathFilterExcludes,
  validationPathFilterForTool,
  validationPathFilterHasNoMatchingIncludes,
  validationPathFilterIntersections,
} from "@/validation/config/path-filter";
import {
  DPRINT_CONFIG_FILENAME,
  type FormattingValidationContext,
  type FormattingValidationResult,
  validateFormatting,
} from "@/validation/steps/formatting";
import type { ValidationSubprocessOutputStreams } from "@/validation/steps/subprocess-output";
import { VALIDATION_COMMAND_OUTPUT, VALIDATION_STAGE_DISPLAY_NAMES } from "./messages";
import type { FormattingCommandOptions, ValidationCommandResult } from "./types";

export interface FormattingCommandDependencies {
  readonly validateFormatting: typeof validateFormatting;
}

const defaultFormattingCommandDependencies: FormattingCommandDependencies = {
  validateFormatting,
};

export const FORMATTING_COMMAND_OUTPUT = {
  NO_ISSUES: VALIDATION_COMMAND_OUTPUT.FORMATTING_NO_ISSUES,
  FAILURE_SUMMARY: VALIDATION_COMMAND_OUTPUT.FORMATTING_FAILURE_SUMMARY,
  EMPTY_SCOPE_REASON: "no files in scope",
  NO_CONFIG_SKIP_REASON: `no ${DPRINT_CONFIG_FILENAME} at product root`,
} as const;

const FORMATTING_CONFIG_ERROR_MESSAGE = `${VALIDATION_STAGE_DISPLAY_NAMES.FORMATTING}: ✗ config error`;
const DPRINT_RECURSIVE_DIRECTORY_GLOB_SUFFIX = "/**/*";

/**
 * Run formatting validation.
 *
 * @param options - Command options including cwd and optional file scoping
 * @returns Command result with exit code and output
 */
export async function formattingCommand(
  options: FormattingCommandOptions,
  dependencies: FormattingCommandDependencies = defaultFormattingCommandDependencies,
): Promise<ValidationCommandResult> {
  const { cwd, files, outputStreams, quiet } = options;
  const startTime = Date.now();

  const loaded = await resolveConfig(cwd, [validationConfigDescriptor]);
  if (!loaded.ok) {
    return {
      exitCode: 1,
      output: `${FORMATTING_CONFIG_ERROR_MESSAGE} — ${loaded.error}`,
      durationMs: Date.now() - startTime,
    };
  }
  const validationConfig = loaded.value[validationConfigDescriptor.section] as ValidationConfig;

  // A product without a root dprint.jsonc has no formatting contract to enforce.
  // Skipping here keeps a personal global dprint config from deciding the
  // verdict — dprint's upward config discovery would otherwise reach it.
  if (!existsSync(join(cwd, DPRINT_CONFIG_FILENAME))) {
    const output = quiet
      ? ""
      : `${VALIDATION_STAGE_DISPLAY_NAMES.FORMATTING}: skipped (${FORMATTING_COMMAND_OUTPUT.NO_CONFIG_SKIP_REASON})`;
    return { exitCode: 0, output, durationMs: Date.now() - startTime };
  }

  const pathFilter = validationPathFilterForTool(
    validationConfig.paths,
    VALIDATION_PATH_TOOL_SUBSECTIONS.FORMATTING,
  );

  // dprint runs with cwd === productDir and resolves relative paths against it,
  // so a relative scope passes through unchanged while an absolute scope is
  // relativized to the product directory — an absolute path does not match dprint's
  // product-relative include globs.
  const hasExplicitScope = files !== undefined && files.length > 0;
  const contexts = formattingValidationContexts(cwd, files, pathFilter);
  const scopedFiles = contexts.flatMap((context) => context.files ?? []);

  if ((hasExplicitScope && scopedFiles.length === 0) || contexts.length === 0) {
    const output = quiet
      ? ""
      : `${VALIDATION_STAGE_DISPLAY_NAMES.FORMATTING}: skipped (${FORMATTING_COMMAND_OUTPUT.EMPTY_SCOPE_REASON})`;
    return { exitCode: 0, output, durationMs: Date.now() - startTime };
  }

  const results: FormattingValidationResult[] = [];
  for (const context of contexts) {
    results.push(await dependencies.validateFormatting(context, undefined, outputStreams));
  }
  const durationMs = Date.now() - startTime;

  if (results.every((result) => result.success)) {
    return { exitCode: 0, output: quiet ? "" : FORMATTING_COMMAND_OUTPUT.NO_ISSUES, durationMs };
  }

  const detail = results
    .filter((result) => !result.success)
    .map((result) => result.error ?? result.output)
    .filter((output) => output.length > 0)
    .join("\n");
  const output = [FORMATTING_COMMAND_OUTPUT.FAILURE_SUMMARY, detail].filter((line) => line.length > 0).join("\n");
  const terminalOutput = formattingTerminalOutput(results, outputStreams);
  return { exitCode: 1, output, terminalOutput, durationMs };
}

function formattingValidationContexts(
  productDir: string,
  files: readonly string[] | undefined,
  pathFilter: Parameters<typeof pathPassesValidationFilter>[1],
): FormattingValidationContext[] {
  if (files === undefined || files.length === 0) {
    if (validationPathFilterHasNoMatchingIncludes(pathFilter)) return [];
    const automaticFiles = pathFilter.include
      ?.map((path) => normalizeFormattingPathOperand(productDir, path));
    return [{
      productDir,
      files: automaticFiles !== undefined && automaticFiles.length > 0 ? automaticFiles : undefined,
      excludes: validationPathFilterExcludes(pathFilter),
    }];
  }
  const relativeFiles = files.map((filePath) => isAbsolute(filePath) ? relative(productDir, filePath) : filePath);
  const explicitFiles = relativeFiles.filter((filePath) => isFormattingFileOperand(productDir, filePath));
  const directories = relativeFiles.filter((filePath) => !isFormattingFileOperand(productDir, filePath));
  const scopedDirectories = directories.flatMap((filePath) =>
    formattingPathOperandsForValidationPathFilter(productDir, filePath, pathFilter)
  );
  return [
    ...(explicitFiles.length > 0
      ? [{ productDir, files: explicitFiles, excludes: [] }]
      : []),
    ...(scopedDirectories.length > 0
      ? [{
        productDir,
        files: scopedDirectories,
        excludes: validationPathFilterExcludes(pathFilter),
      }]
      : []),
  ];
}

function formattingTerminalOutput(
  results: readonly FormattingValidationResult[],
  outputStreams: ValidationSubprocessOutputStreams | undefined,
): string | undefined {
  if (outputStreams === undefined || results.some((result) => result.error !== undefined)) return undefined;
  return FORMATTING_COMMAND_OUTPUT.FAILURE_SUMMARY;
}

function normalizeFormattingPathOperand(productDir: string, relativePath: string): string {
  if (isFormattingFileOperand(productDir, relativePath)) {
    return relativePath;
  }
  const normalizedDirectory = normalizePathPrefix(relativePath);
  if (normalizedDirectory.length === 0) {
    return DPRINT_RECURSIVE_DIRECTORY_GLOB_SUFFIX.slice(1);
  }
  return `${normalizedDirectory}${DPRINT_RECURSIVE_DIRECTORY_GLOB_SUFFIX}`;
}

function isFormattingFileOperand(productDir: string, relativePath: string): boolean {
  const absolutePath = join(productDir, relativePath);
  return !existsSync(absolutePath) || !statSync(absolutePath).isDirectory();
}

function formattingPathOperandsForValidationPathFilter(
  productDir: string,
  relativePath: string,
  pathFilter: Parameters<typeof pathPassesValidationFilter>[1],
): string[] {
  if (isFormattingFileOperand(productDir, relativePath)) {
    return [relativePath];
  }
  return validationPathFilterIntersections(relativePath, pathFilter)
    .map((path) => normalizeFormattingPathOperand(productDir, path));
}
