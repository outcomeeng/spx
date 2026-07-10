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

import { normalizePathPrefix } from "@/config/primitives/path-filter";
import { createNodeStatusExcludeReader } from "@/lib/node-status";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";

// @ts-expect-error markdownlint-cli2 has no TypeScript type declarations
import { main as markdownlintMain } from "markdownlint-cli2";
import relativeLinksRule from "markdownlint-rule-relative-links";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default directories to validate when no path operands are specified. */
export const MARKDOWN_DEFAULT_DIRECTORY_NAMES = [SPEC_TREE_CONFIG.ROOT_DIRECTORY, "docs"] as const;
export const MARKDOWN_PRIMARY_FILE_EXTENSION = ".md";
const MARKDOWN_FILE_EXTENSIONS: ReadonlySet<string> = new Set([".md", ".markdown"]);
export const MARKDOWN_DIRECTORY_GLOB = "**/*.md";

/** Built-in markdownlint rules enabled for validation (MD024 excluded — configured per directory). */
export const MARKDOWN_ENABLED_BUILTIN_RULES = {
  MD001: true,
  MD003: true,
  MD009: true,
  MD010: true,
  MD025: true,
  MD047: true,
} as const;

export const MARKDOWN_CONFIG_CONTROL_KEYS = {
  DEFAULT: "default",
  DUPLICATE_HEADINGS: "MD024",
  CUSTOM_RULES: "customRules",
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
  /** Whether spx/EXCLUDE node-status skips apply to direct spec-node markdown files. */
  applyNodeStatusExcludes?: boolean;
  /** Product-relative validation path excludes to pass to markdownlint. */
  validationPathExcludes?: readonly string[];
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
    [MARKDOWN_CONFIG_CONTROL_KEYS.DEFAULT]: false,
    ...MARKDOWN_ENABLED_BUILTIN_RULES,
    [MARKDOWN_CONFIG_CONTROL_KEYS.DUPLICATE_HEADINGS]: md024Disabled ? false : { siblings_only: true },
    [MARKDOWN_CONFIG_CONTROL_KEYS.CUSTOM_RULES]: [relativeLinksRule],
  };
}

// =============================================================================
// DEFAULT DIRECTORIES
// =============================================================================

/**
 * Get the default directories to validate.
 *
 * Returns absolute paths for spx/ and docs/ directories that exist
 * within the given project root.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Array of absolute paths to existing default directories
 */
export function getDefaultDirectories(projectRoot: string): string[] {
  return MARKDOWN_DEFAULT_DIRECTORY_NAMES
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

function getExcludeGlobsForTarget(
  target: MarkdownValidationTarget,
  projectRoot: string | undefined,
  entries: readonly string[],
): string[] {
  if (projectRoot === undefined || entries.length === 0) return [];

  const directory = targetDirectory(target);
  const specTreeRoot = join(projectRoot, SPEC_TREE_CONFIG.ROOT_DIRECTORY);
  const targetPath = normalizePathPrefix(pathRelative(specTreeRoot, directory));
  return entries.flatMap((entry) => {
    const excludedPath = normalizePathPrefix(entry);
    if (targetPath === excludedPath) {
      return directMarkdownGlobs("");
    }
    if (!pathContainsValidationPath(targetPath, excludedPath)) {
      return [];
    }
    return directMarkdownGlobs(
      normalizePathPrefix(pathRelative(directory, join(specTreeRoot, excludedPath))),
    );
  });
}

function directMarkdownGlobs(directory: string): string[] {
  return [...MARKDOWN_FILE_EXTENSIONS].map((extension) =>
    directory.length === 0 ? `*${extension}` : `${directory}/*${extension}`
  );
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
  const parsed = parseMarkdownlintErrorLine(line);
  if (parsed === null) return null;
  return {
    file: parsed.file,
    line: Number.parseInt(parsed.line, 10),
    detail: parsed.detail,
  };
}

function parseMarkdownlintErrorLine(line: string): {
  readonly file: string;
  readonly line: string;
  readonly detail: string;
} | null {
  for (
    let fileSeparator = line.indexOf(":");
    fileSeparator > 0;
    fileSeparator = line.indexOf(":", fileSeparator + 1)
  ) {
    const parsed = parseMarkdownlintErrorLineAtSeparator(line, fileSeparator);
    if (parsed !== null) return parsed;
  }
  return null;
}

function parseMarkdownlintErrorLineAtSeparator(
  line: string,
  fileSeparator: number,
): {
  readonly file: string;
  readonly line: string;
  readonly detail: string;
} | null {
  const lineStart = fileSeparator + 1;
  const lineEnd = scanDigits(line, lineStart);
  if (lineEnd === lineStart) return null;
  const detailStart = scanMarkdownlintColumnAndWhitespace(line, lineEnd);
  if (detailStart === null || detailStart >= line.length) return null;
  return {
    file: line.slice(0, fileSeparator),
    line: line.slice(lineStart, lineEnd),
    detail: line.slice(detailStart),
  };
}

function scanDigits(value: string, start: number): number {
  let index = start;
  while (index < value.length && isAsciiDigit(value[index] ?? "")) {
    index += 1;
  }
  return index;
}

function scanMarkdownlintColumnAndWhitespace(value: string, start: number): number | null {
  let index = start;
  if (value[index] === ":") {
    const columnStart = index + 1;
    index = scanDigits(value, columnStart);
    if (index === columnStart) return null;
  }
  if (!isAsciiWhitespace(value[index] ?? "")) return null;
  while (index < value.length && isAsciiWhitespace(value[index] ?? "")) {
    index += 1;
  }
  return index;
}

function isAsciiDigit(value: string): boolean {
  return value >= "0" && value <= "9";
}

function isAsciiWhitespace(value: string): boolean {
  return value === " " || value === "\t";
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
  const {
    targets,
    projectRoot,
    applyNodeStatusExcludes = true,
    validationPathExcludes = [],
  } = options;
  const errors: MarkdownError[] = [];
  const specTreeExcludeEntries = applyNodeStatusExcludes ? getExcludeEntries(projectRoot) : [];

  for (const target of targets) {
    const directory = targetDirectory(target);
    const dirName = markdownlintConfigDirectoryName(directory, projectRoot);
    const config = buildMarkdownlintConfig(dirName);
    const excludeGlobs = [
      ...getExcludeGlobsForTarget(target, projectRoot, specTreeExcludeEntries),
      ...validationPathExcludeGlobsForTarget(target, projectRoot, validationPathExcludes),
    ];
    const dirErrors = await validateTarget(target, config, projectRoot, excludeGlobs);
    errors.push(...dirErrors);
  }

  return {
    success: errors.length === 0,
    errors,
  };
}

function getExcludeEntries(projectRoot: string | undefined): readonly string[] {
  if (projectRoot === undefined) return [];
  return createNodeStatusExcludeReader(projectRoot).entries();
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

function validationPathExcludeGlobsForTarget(
  target: MarkdownValidationTarget,
  projectRoot: string | undefined,
  excludes: readonly string[],
): string[] {
  if (
    projectRoot === undefined
    || excludes.length === 0
    || target.kind === MARKDOWN_VALIDATION_TARGET_KIND.FILE
  ) return [];

  const directory = targetDirectory(target);
  const targetPath = normalizePathPrefix(pathRelative(projectRoot, directory));
  return excludes.flatMap((exclude) => {
    const excludedPath = normalizePathPrefix(exclude);
    if (targetPath === excludedPath) {
      return [];
    }
    if (!pathContainsValidationPath(targetPath, excludedPath)) {
      return [];
    }
    const relativeExclude = normalizePathPrefix(pathRelative(directory, join(projectRoot, excludedPath)));
    if (relativeExclude.length === 0) {
      return [MARKDOWN_DIRECTORY_GLOB];
    }
    const absoluteExclude = join(projectRoot, excludedPath);
    return [
      isExistingFile(absoluteExclude, defaultMarkdownValidationTargetDeps) ? relativeExclude : `${relativeExclude}/**`,
    ];
  });
}

function pathContainsValidationPath(prefix: string, path: string): boolean {
  if (prefix.length === 0) return true;
  return path === prefix || path.startsWith(`${prefix}/`);
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
