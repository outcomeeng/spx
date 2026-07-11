/**
 * Formatting validation generator.
 *
 * Owns the scenario vocabulary and fixture data for the dprint formatting
 * stage's co-located evidence. Test files reference these scenarios and data
 * tokens so no domain literal lives in a test file. The driver harness in
 * `@testing/harnesses/validation/formatting` consumes the scenario list.
 */

import * as fc from "fast-check";

/** A TypeScript snippet dprint reformats (collapsed spacing around `=`). */
const UNFORMATTED_TYPESCRIPT_CONTENT = "export const value     =     1;\n";

/** A minimal TypeScript snippet the harness canonicalizes with `dprint fmt`. */
const FORMATTABLE_TYPESCRIPT_CONTENT = "export const value = 1;\n";

const TYPESCRIPT_SOURCE_FILENAME = "sample.ts";

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

/** Paths the formatting verdict must never rewrite, per the formatting spec. */
const NEVER_FORMATTED_PATHS = ["pnpm-lock.yaml", "testing/fixtures/**"] as const;

export const FORMATTING_SCENARIO_KIND = {
  CLEAN_PROJECT: "cleanProject",
  UNFORMATTED_COMMAND: "unformattedCommand",
  PIPELINE_FAILURE: "pipelineFailure",
  CLI_PROCESS_UNFORMATTED: "cliProcessUnformatted",
  CLI_PROCESS_DIRECTORY_SCOPE: "cliProcessDirectoryScope",
  CLI_PROCESS_INVOCATION_DIRECTORY_SCOPE: "cliProcessInvocationDirectoryScope",
  CLI_PROCESS_DIRECTORY_INCLUDE_SCOPE: "cliProcessDirectoryIncludeScope",
  CLI_PROCESS_EXCLUDED_FILE_SCOPE: "cliProcessExcludedFileScope",
  CLI_PROCESS_FILTERED_DIRECTORY_SCOPE: "cliProcessFilteredDirectoryScope",
  CLI_PROCESS_EXCLUDED_DIRECTORY_SCOPE: "cliProcessExcludedDirectoryScope",
  GITIGNORE_SKIP: "gitignoreSkip",
} as const;

export type FormattingScenarioKind = (typeof FORMATTING_SCENARIO_KIND)[keyof typeof FORMATTING_SCENARIO_KIND];

export interface FormattingValidationScenario {
  readonly title: string;
  readonly kind: FormattingScenarioKind;
}

export const FORMATTING_VALIDATION_DATA = {
  unformattedTypeScriptContent: UNFORMATTED_TYPESCRIPT_CONTENT,
  formattableTypeScriptContent: FORMATTABLE_TYPESCRIPT_CONTENT,
  typeScriptSourceFilename: TYPESCRIPT_SOURCE_FILENAME,
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
  neverFormattedPaths: NEVER_FORMATTED_PATHS,
} as const;

export function formattingScenarios(): FormattingValidationScenario[] {
  return [
    {
      title: "a fully formatted project reports no problems and exits zero",
      kind: FORMATTING_SCENARIO_KIND.CLEAN_PROJECT,
    },
    {
      title: "an unformatted file is reported and the command exits non-zero",
      kind: FORMATTING_SCENARIO_KIND.UNFORMATTED_COMMAND,
    },
    {
      title: "formatting failure fails the full validation pipeline",
      kind: FORMATTING_SCENARIO_KIND.PIPELINE_FAILURE,
    },
    {
      title: "the format CLI process exits non-zero and names the unformatted file",
      kind: FORMATTING_SCENARIO_KIND.CLI_PROCESS_UNFORMATTED,
    },
    {
      title: "the format CLI process expands directory operands before checking files",
      kind: FORMATTING_SCENARIO_KIND.CLI_PROCESS_DIRECTORY_SCOPE,
    },
    {
      title: "the format CLI process resolves operands from the invocation directory",
      kind: FORMATTING_SCENARIO_KIND.CLI_PROCESS_INVOCATION_DIRECTORY_SCOPE,
    },
    {
      title: "the format CLI process intersects root operands with validation includes",
      kind: FORMATTING_SCENARIO_KIND.CLI_PROCESS_DIRECTORY_INCLUDE_SCOPE,
    },
    {
      title: "the format CLI process preserves explicit file operands through validation excludes",
      kind: FORMATTING_SCENARIO_KIND.CLI_PROCESS_EXCLUDED_FILE_SCOPE,
    },
    {
      title: "the format CLI process intersects directory operands with validation includes",
      kind: FORMATTING_SCENARIO_KIND.CLI_PROCESS_FILTERED_DIRECTORY_SCOPE,
    },
    {
      title: "the format CLI process excludes descendants below directory operands",
      kind: FORMATTING_SCENARIO_KIND.CLI_PROCESS_EXCLUDED_DIRECTORY_SCOPE,
    },
    {
      title: "a gitignored unformatted file is skipped and the command exits zero",
      kind: FORMATTING_SCENARIO_KIND.GITIGNORE_SKIP,
    },
  ];
}

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
