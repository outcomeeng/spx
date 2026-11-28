/**
 * Formatting validation generator.
 *
 * Owns the scenario vocabulary and fixture data for the dprint formatting
 * stage's co-located evidence. Test files reference these scenarios and data
 * tokens so no domain literal lives in a test file. The driver harness in
 * `@testing/harnesses/validation/formatting` consumes the fixture data.
 */

import * as fc from "fast-check";

/** A TypeScript snippet dprint reformats (collapsed spacing around `=`). */
const UNFORMATTED_TYPESCRIPT_CONTENT = "export const value     =     1;\n";

/** A minimal TypeScript snippet the harness canonicalizes with `dprint fmt`. */
const FORMATTABLE_TYPESCRIPT_CONTENT = "export const value = 1;\n";

const TYPESCRIPT_SOURCE_FILENAME = "sample.ts";
const RECURSIVE_DIRECTORY_GLOB = "**/*";
const GLOB_WILDCARD = "**";
const PRODUCT_ROOT_OPERAND = ".";
/** One stage run: the formatting stage runs once under its default and not under its override. */
const SINGLE_STAGE_EXECUTION_COUNT = 1;

const DPRINT_CONFIG_FILENAME = "dprint.jsonc";
const EXPECTED_DPRINT_CHECK_SUBCOMMAND = "check";
const EXPECTED_DPRINT_EXCLUDES_OPTION = "--excludes";
const EXPECTED_DPRINT_OPTIONS_TERMINATOR = "--";
const VALIDATION_CONFIG_FILENAME = "spx.config.yaml";
const GITIGNORE_FILENAME = ".gitignore";
const NARROWED_SCOPE_DIRECTORY_NAME = "src";
const NARROWED_SCOPE_TYPESCRIPT_SOURCE_PATH = `${NARROWED_SCOPE_DIRECTORY_NAME}/${TYPESCRIPT_SOURCE_FILENAME}`;
const SECONDARY_SCOPE_DIRECTORY_NAME = "docs";
const SECONDARY_SCOPE_TYPESCRIPT_SOURCE_PATH = `${SECONDARY_SCOPE_DIRECTORY_NAME}/${TYPESCRIPT_SOURCE_FILENAME}`;
const EXCLUDED_SCOPE_DIRECTORY_NAME = "private";
const EXCLUDED_SCOPE_TYPESCRIPT_SOURCE_PATH =
  `${NARROWED_SCOPE_DIRECTORY_NAME}/${EXCLUDED_SCOPE_DIRECTORY_NAME}/${TYPESCRIPT_SOURCE_FILENAME}`;

const EXPECTED_PASS_EXIT_CODE = 0;
const EXPECTED_FAILURE_EXIT_CODE = 1;

/** Extensions the product's dprint config formats, per the formatting spec. */
const FORMATTED_FILE_EXTENSIONS = [
  "ts",
  "tsx",
  "js",
  "json",
  "jsonc",
  "md",
  "toml",
  "yaml",
  "yml",
] as const;

const UNFORMATTED_CONTENT_BY_EXTENSION: Readonly<Record<(typeof FORMATTED_FILE_EXTENSIONS)[number], string>> = {
  ts: "export const value     =     1;\n",
  tsx: "export const value     =     <div>value</div>;\n",
  js: "export const value     =     1;\n",
  json: "{\"value\":1}\n",
  jsonc: "{\"value\":1}\n",
  md: "# Heading   \n",
  toml: "value=1\n",
  yaml: "value:    1\n",
  yml: "value:    1\n",
};

/** Paths the formatting verdict must never rewrite, per the formatting spec. */
const NEVER_FORMATTED_PATHS = ["pnpm-lock.yaml", "testing/fixtures/**"] as const;

export const FORMATTING_VALIDATION_DATA = {
  unformattedTypeScriptContent: UNFORMATTED_TYPESCRIPT_CONTENT,
  formattableTypeScriptContent: FORMATTABLE_TYPESCRIPT_CONTENT,
  typeScriptSourceFilename: TYPESCRIPT_SOURCE_FILENAME,
  recursiveDirectoryGlob: RECURSIVE_DIRECTORY_GLOB,
  globWildcard: GLOB_WILDCARD,
  productRootOperand: PRODUCT_ROOT_OPERAND,
  singleStageExecutionCount: SINGLE_STAGE_EXECUTION_COUNT,
  expectedDprintCheckSubcommand: EXPECTED_DPRINT_CHECK_SUBCOMMAND,
  expectedDprintExcludesOption: EXPECTED_DPRINT_EXCLUDES_OPTION,
  expectedDprintOptionsTerminator: EXPECTED_DPRINT_OPTIONS_TERMINATOR,
  dprintConfigFilename: DPRINT_CONFIG_FILENAME,
  validationConfigFilename: VALIDATION_CONFIG_FILENAME,
  gitignoreFilename: GITIGNORE_FILENAME,
  narrowedScopeDirectoryName: NARROWED_SCOPE_DIRECTORY_NAME,
  narrowedScopeTypeScriptSourcePath: NARROWED_SCOPE_TYPESCRIPT_SOURCE_PATH,
  secondaryScopeDirectoryName: SECONDARY_SCOPE_DIRECTORY_NAME,
  secondaryScopeTypeScriptSourcePath: SECONDARY_SCOPE_TYPESCRIPT_SOURCE_PATH,
  excludedScopeDirectoryName: EXCLUDED_SCOPE_DIRECTORY_NAME,
  excludedScopeTypeScriptSourcePath: EXCLUDED_SCOPE_TYPESCRIPT_SOURCE_PATH,
  passExitCode: EXPECTED_PASS_EXIT_CODE,
  failureExitCode: EXPECTED_FAILURE_EXIT_CODE,
  formattedFileExtensions: FORMATTED_FILE_EXTENSIONS,
  unformattedContentByExtension: UNFORMATTED_CONTENT_BY_EXTENSION,
  neverFormattedPaths: NEVER_FORMATTED_PATHS,
} as const;

/**
 * Arbitrary explicit file-scope lists passed to `dprint check`.
 *
 * The argument builder treats file scope as opaque path strings, so the domain
 * is non-empty relative-path-shaped strings of varying length, owned here so no
 * property test hardcodes its own input values.
 */
export function arbitraryDprintFileArguments(): fc.Arbitrary<string[]> {
  const pathSegment = fc.string({ minLength: 1, maxLength: 12 }).filter((segment) => !segment.includes("\0"));
  const filePath = fc.array(pathSegment, { minLength: 1, maxLength: 4 }).map((segments) => segments.join("/"));
  return fc.array(filePath, { maxLength: 6 });
}
