/**
 * Markdown validation step.
 *
 * Validates markdown files using markdownlint-cli2's programmatic API.
 * Configuration is built in code and passed via optionsOverride --
 * no config files are written to validated directories.
 *
 * @module validation/steps/markdown
 */

import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, relative as pathRelative } from "node:path";

import { createIgnoreSourceReader, IGNORE_SOURCE_FILENAME_DEFAULT } from "@/lib/file-inclusion/ignore-source";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";

// @ts-expect-error markdownlint-cli2 has no TypeScript type declarations
import { main as markdownlintMain } from "markdownlint-cli2";
import relativeLinksRule from "markdownlint-rule-relative-links";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default directories to validate when no --files are specified. */
const DEFAULT_DIRECTORY_NAMES = ["spx", "docs"] as const;
const MARKDOWN_FILE_EXTENSIONS: ReadonlySet<string> = new Set([".md", ".markdown"]);
export const MARKDOWN_DIRECTORY_GLOB = "**/*.md";

/** Built-in markdownlint rules enabled for validation (MD024 excluded — configured per directory). */
const ENABLED_RULES = {
  MD001: true,
  MD003: true,
  MD009: true,
  MD010: true,
  MD025: true,
  MD047: true,
} as const;

/** Directories where MD024 is disabled entirely (generated/repetitive headings are normal). */
const MD024_DISABLED_DIRECTORIES = ["docs"] as const;

export const MARKDOWN_CUSTOM_RULE_NAMES = relativeLinksRule.names;
export const MARKDOWN_VALIDATION_TARGET_KIND = {
  DIRECTORY: "directory",
  FILE: "file",
} as const;

export const MARKDOWN_VALIDATION_TARGET_DIAGNOSTICS = {
  MISSING_OR_UNRELATED_SCOPE: "not an existing directory or markdown file",
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
  /** Files or directories to validate. */
  targets: MarkdownValidationTarget[];
  /** Project root for resolving project-absolute links. */
  projectRoot?: string;
}

export interface MarkdownValidationTarget {
  readonly kind: MarkdownValidationTargetKind;
  readonly path: string;
}

export type MarkdownValidationTargetKind =
  (typeof MARKDOWN_VALIDATION_TARGET_KIND)[keyof typeof MARKDOWN_VALIDATION_TARGET_KIND];

export interface MarkdownSkippedValidationTarget {
  readonly path: string;
  readonly reason: string;
}

export interface MarkdownValidationTargetResolution {
  readonly skipped?: MarkdownSkippedValidationTarget;
  readonly target?: MarkdownValidationTarget;
}

export interface MarkdownValidationTargetDeps {
  readonly statSync: typeof statSync;
}

const defaultMarkdownValidationTargetDeps: MarkdownValidationTargetDeps = {
  statSync,
};

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Build the markdownlint configuration object.
 *
 * MD024 (no duplicate headings) is configured per directory:
 * - `spx/` and other spec directories: `siblings_only` — allows same heading
 *   under different parents, flags true sibling duplicates
 * - `docs/`: disabled — generated/repetitive docs commonly reuse headings
 *
 * @param directoryName - Basename of the directory being validated (e.g. "spx", "docs")
 * @returns Configuration object for markdownlint-cli2's optionsOverride
 */
export function buildMarkdownlintConfig(directoryName: string): {
  default: boolean;
  MD001: boolean;
  MD003: boolean;
  MD009: boolean;
  MD010: boolean;
  MD024: boolean | { siblings_only: boolean };
  MD025: boolean;
  MD047: boolean;
  customRules: MarkdownlintRule[];
} {
  const md024Disabled = MD024_DISABLED_DIRECTORIES.includes(
    directoryName as (typeof MD024_DISABLED_DIRECTORIES)[number],
  );

  return {
    default: false,
    ...ENABLED_RULES,
    MD024: md024Disabled ? false : { siblings_only: true },
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

export function classifyMarkdownValidationTarget(
  path: string,
  deps: MarkdownValidationTargetDeps = defaultMarkdownValidationTargetDeps,
): MarkdownValidationTarget | undefined {
  return resolveMarkdownValidationTarget(path, deps).target;
}

export function resolveMarkdownValidationTarget(
  path: string,
  deps: MarkdownValidationTargetDeps = defaultMarkdownValidationTargetDeps,
): MarkdownValidationTargetResolution {
  if (isExistingDirectory(path, deps)) {
    return { target: { kind: MARKDOWN_VALIDATION_TARGET_KIND.DIRECTORY, path } };
  }
  if (hasMarkdownExtension(path) && isExistingFile(path, deps)) {
    return { target: { kind: MARKDOWN_VALIDATION_TARGET_KIND.FILE, path } };
  }
  return {
    skipped: {
      path,
      reason: MARKDOWN_VALIDATION_TARGET_DIAGNOSTICS.MISSING_OR_UNRELATED_SCOPE,
    },
  };
}

// =============================================================================
// EXCLUDE SUPPORT
// =============================================================================

/**
 * Read node paths from spx/EXCLUDE and return them as ignore globs.
 *
 * Declared-state nodes have [test] links pointing to files that do not
 * exist yet. Listing them in spx/EXCLUDE tells markdown validation to
 * skip those directories so broken [test] links are not flagged.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Array of glob patterns to ignore (relative to the validated directory)
 */
export function getExcludeGlobs(projectRoot: string | undefined): string[] {
  if (projectRoot === undefined) return [];
  const reader = createIgnoreSourceReader(projectRoot, {
    ignoreSourceFilename: IGNORE_SOURCE_FILENAME_DEFAULT,
    specTreeRootSegment: SPEC_TREE_CONFIG.ROOT_DIRECTORY,
  });
  return reader.entries().map((entry) => `${entry.segment}/**`);
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
 * Validate markdown files in the specified targets.
 *
 * Uses markdownlint-cli2's programmatic API with in-code configuration.
 * No config files are written to validated directories.
 *
 * @param options - Validation options including targets and project root
 * @returns Validation result with success status and structured errors
 *
 * @example
 * ```typescript
 * const result = await validateMarkdown({
 *   targets: [{ kind: MARKDOWN_VALIDATION_TARGET_KIND.DIRECTORY, path: "/path/to/spx" }],
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
  const { targets, projectRoot } = options;
  const errors: MarkdownError[] = [];
  const excludeGlobs = getExcludeGlobs(projectRoot);

  for (const target of targets) {
    const directory = targetDirectory(target);
    const dirName = markdownlintConfigDirectoryName(directory, projectRoot);
    const config = buildMarkdownlintConfig(dirName);
    const dirErrors = await validateTarget(target, config, projectRoot, excludeGlobs);
    errors.push(...dirErrors);
  }

  return {
    success: errors.length === 0,
    errors,
  };
}

/**
 * Validate a single target using markdownlint-cli2's programmatic API.
 *
 * @param target - Absolute path target to validate
 * @param config - Markdownlint configuration object
 * @param projectRoot - Optional project root for resolving project-absolute links
 * @returns Array of structured errors found in the directory
 */
async function validateTarget(
  target: MarkdownValidationTarget,
  config: ReturnType<typeof buildMarkdownlintConfig>,
  projectRoot?: string,
  ignoreGlobs: string[] = [],
): Promise<MarkdownError[]> {
  const errors: MarkdownError[] = [];
  const directory = targetDirectory(target);
  const argv = target.kind === MARKDOWN_VALIDATION_TARGET_KIND.FILE
    ? [basename(target.path)]
    : [MARKDOWN_DIRECTORY_GLOB];

  const { customRules, ...markdownlintConfig } = config;

  const optionsOverride: Record<string, unknown> = {
    config: {
      ...markdownlintConfig,
      "relative-links": projectRoot ? { root_path: projectRoot } : true,
    },
    customRules,
    noProgress: true,
    noBanner: true,
    ...(ignoreGlobs.length > 0 ? { ignores: ignoreGlobs } : {}),
  };

  await markdownlintMain({
    directory,
    argv,
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

function targetDirectory(target: MarkdownValidationTarget): string {
  return target.kind === MARKDOWN_VALIDATION_TARGET_KIND.FILE ? dirname(target.path) : target.path;
}

function hasMarkdownExtension(path: string): boolean {
  const lastDot = path.lastIndexOf(".");
  if (lastDot < 0) return false;
  return MARKDOWN_FILE_EXTENSIONS.has(path.slice(lastDot).toLowerCase());
}

function isExistingDirectory(path: string, deps: MarkdownValidationTargetDeps): boolean {
  try {
    return deps.statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isExistingFile(path: string, deps: MarkdownValidationTargetDeps): boolean {
  try {
    return deps.statSync(path).isFile();
  } catch {
    return false;
  }
}

function markdownlintConfigDirectoryName(directory: string, projectRoot: string | undefined): string {
  if (projectRoot !== undefined) {
    const [rootSegment] = pathRelative(projectRoot, directory).split(/[\\/]/);
    if (MD024_DISABLED_DIRECTORIES.includes(rootSegment as (typeof MD024_DISABLED_DIRECTORIES)[number])) {
      return rootSegment;
    }
  }
  return basename(directory);
}
