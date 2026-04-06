/**
 * Markdown validation step.
 *
 * Validates markdown files using markdownlint-cli2's programmatic API.
 * Configuration is built in code and passed via optionsOverride --
 * no config files are written to validated directories.
 *
 * @module validation/steps/markdown
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

// @ts-expect-error markdownlint-cli2 has no TypeScript type declarations
import { main as markdownlintMain } from "markdownlint-cli2";
import relativeLinksRule from "markdownlint-rule-relative-links";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default directories to validate when no --files are specified. */
const DEFAULT_DIRECTORY_NAMES = ["spx", "docs"] as const;

/** Built-in markdownlint rules enabled for validation. */
const ENABLED_RULES = {
  MD001: true,
  MD003: true,
  MD009: true,
  MD010: true,
  MD024: true,
  MD025: true,
  MD047: true,
} as const;

/**
 * Pattern for parsing markdownlint-cli2 default formatter output.
 * Format: filename:line[:column] [severity] ruleName/ruleAlias description [detail] [context]
 */
const ERROR_LINE_PATTERN = /^(.+?):(\d+)(?::\d+)?\s+(.+)$/;

// =============================================================================
// TYPES
// =============================================================================

/** A structured error from markdown validation. */
export interface MarkdownError {
  /** Absolute path to the file containing the error. */
  file: string;
  /** Line number where the error occurs (1-based). */
  line: number;
  /** Description of the error including rule name and detail. */
  detail: string;
}

/** Result of markdown validation. */
export interface MarkdownValidationResult {
  /** Whether all files passed validation. */
  success: boolean;
  /** Structured errors found during validation. */
  errors: MarkdownError[];
}

/** A markdownlint custom rule object. */
interface MarkdownlintRule {
  names: string[];
  description: string;
  tags: string[];
}

/** Options for the validateMarkdown function. */
export interface ValidateMarkdownOptions {
  /** Directories to validate. */
  directories: string[];
  /** Project root for resolving project-absolute links. */
  projectRoot?: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Build the markdownlint configuration object.
 *
 * Returns a configuration that disables all default rules and enables
 * only the curated subset, plus the relative-links custom rule.
 * This is a pure function for testability.
 *
 * @returns Configuration object for markdownlint-cli2's optionsOverride
 */
export function buildMarkdownlintConfig(): {
  default: boolean;
  MD001: boolean;
  MD003: boolean;
  MD009: boolean;
  MD010: boolean;
  MD024: boolean;
  MD025: boolean;
  MD047: boolean;
  customRules: MarkdownlintRule[];
} {
  return {
    default: false,
    ...ENABLED_RULES,
    customRules: [relativeLinksRule],
  };
}

// =============================================================================
// DEFAULT DIRECTORIES
// =============================================================================

/**
 * Get the default directories to validate.
 *
 * Returns absolute paths for spx/ and docs/ directories that exist
 * within the given project root. This is a pure function for testability.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Array of absolute paths to existing default directories
 */
export function getDefaultDirectories(projectRoot: string): string[] {
  return DEFAULT_DIRECTORY_NAMES
    .map((name) => join(projectRoot, name))
    .filter((dir) => existsSync(dir));
}

// =============================================================================
// ERROR PARSING
// =============================================================================

/**
 * Pattern matching data URIs (data:image/..., data:text/..., etc.).
 * markdownlint-rule-relative-links does not handle data URIs natively
 * and reports them as broken relative links. Filter them out.
 */
const DATA_URI_PATTERN = /\bdata:/;

/**
 * Parse a line of markdownlint-cli2 default formatter output into a structured error.
 *
 * Filters out false positives from data URIs.
 *
 * @param line - A single line of error output
 * @returns Parsed MarkdownError, or null if the line is not a real error
 */
function parseErrorLine(line: string): MarkdownError | null {
  if (DATA_URI_PATTERN.test(line)) {
    return null;
  }
  const match = ERROR_LINE_PATTERN.exec(line);
  if (!match) {
    return null;
  }
  const [, file, lineStr, detail] = match;
  return {
    file,
    line: parseInt(lineStr, 10),
    detail,
  };
}

// =============================================================================
// VALIDATION FUNCTION
// =============================================================================

/**
 * Validate markdown files in the specified directories.
 *
 * Uses markdownlint-cli2's programmatic API with in-code configuration.
 * No config files are written to validated directories.
 *
 * @param options - Validation options including directories and project root
 * @returns Validation result with success status and structured errors
 *
 * @example
 * ```typescript
 * const result = await validateMarkdown({
 *   directories: ["/path/to/spx", "/path/to/docs"],
 *   projectRoot: "/path/to/project",
 * });
 * if (!result.success) {
 *   for (const error of result.errors) {
 *     console.error(`${error.file}:${error.line} ${error.detail}`);
 *   }
 * }
 * ```
 */
export async function validateMarkdown(
  options: ValidateMarkdownOptions,
): Promise<MarkdownValidationResult> {
  const { directories, projectRoot } = options;
  const errors: MarkdownError[] = [];

  const config = buildMarkdownlintConfig();

  for (const directory of directories) {
    const dirErrors = await validateDirectory(directory, config, projectRoot);
    errors.push(...dirErrors);
  }

  return {
    success: errors.length === 0,
    errors,
  };
}

/**
 * Validate a single directory using markdownlint-cli2's programmatic API.
 *
 * @param directory - Absolute path to the directory to validate
 * @param config - Markdownlint configuration object
 * @param projectRoot - Optional project root for resolving project-absolute links
 * @returns Array of structured errors found in the directory
 */
async function validateDirectory(
  directory: string,
  config: ReturnType<typeof buildMarkdownlintConfig>,
  projectRoot?: string,
): Promise<MarkdownError[]> {
  const errors: MarkdownError[] = [];

  const { customRules, ...markdownlintConfig } = config;

  const optionsOverride: Record<string, unknown> = {
    config: {
      ...markdownlintConfig,
      "relative-links": projectRoot ? { root_path: projectRoot } : true,
    },
    customRules,
    noProgress: true,
    noBanner: true,
  };

  await markdownlintMain({
    directory,
    argv: ["**/*.md"],
    optionsOverride,
    noImport: true,
    logMessage: () => {},
    logError: (message: string) => {
      const parsed = parseErrorLine(message);
      if (parsed) {
        errors.push({
          ...parsed,
          file: join(directory, parsed.file),
        });
      }
    },
  });

  return errors;
}
