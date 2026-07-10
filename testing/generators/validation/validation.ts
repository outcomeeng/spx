import * as fc from "fast-check";
import { resolve } from "node:path";

import { LITERAL_PROBLEM_KIND } from "@/commands/validation";
import { CIRCULAR_DEPENDENCY_OUTPUT } from "@/commands/validation/circular";
import { VALIDATION_SUMMARY_STATUS } from "@/commands/validation/format";
import { NO_PROBLEMS_MESSAGE } from "@/commands/validation/literal";
import {
  formatTypeScriptAbsentSkipMessage,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_EXIT_CODES,
  VALIDATION_STAGE_DISPLAY_NAMES,
  VALIDATION_STEP_DURATION_PATTERN,
  VALIDATION_STEP_LINE_PATTERN,
} from "@/commands/validation/messages";
import { VALIDATION_RUNTIME_ANTI_MARKERS } from "@/commands/validation/runtime-diagnostics";
import { CONFIG_PROCESS_CWD } from "@/domains/config/cwd";
import { validationCliDefinition, validationKnownOperands, validationOptionPrefix } from "@/interfaces/cli/validation";
import { TSCONFIG_FILES } from "@/validation/config/scope";
import type { ValidationStageParticipationOverride } from "@/validation/languages/types";
import { typescriptValidationLanguage } from "@/validation/languages/typescript";
import { VALIDATION_PIPELINE_TOTAL_STEPS, validationPipelineStages } from "@/validation/registry";
import { DPRINT_CONFIG_FILENAME } from "@/validation/steps/formatting";
import type { ValidationScope } from "@/validation/types";
import { arbitraryDomainLiteral, arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { type FixtureName, HARNESS_TIMEOUT, PROJECT_FIXTURES } from "@testing/harnesses/with-validation-env";

const PROPERTY_RUN_COUNT_MIN = 8;
const PROPERTY_RUN_COUNT_MAX = 15;
const SUBPROCESS_TIMEOUT_MS_MIN = 10_000;
const SUBPROCESS_TIMEOUT_MS_MAX = 15_000;
const PROPERTY_TIMEOUT_MS_MIN = 60_000;
const PROPERTY_TIMEOUT_MS_MAX = 75_000;

const EMPTY_CLI_ARGUMENT = "";
const CONTROL_ARGUMENT_PARTS = ["bad", "\x01", "arg", "\x1f", "end"] as const;
const UNICODE_ARGUMENT_PARTS = ["unicode", "é", "ø", "日", "語"] as const;
const LITERAL_PROBLEM_KINDS = Object.values(LITERAL_PROBLEM_KIND);
const VALIDATION_CLI_TEMP_PREFIX = "spx-validation-cli-";
const ESCAPING_PATH_OPERAND = "../out\x01side.ts";
const OPTION_OPERAND_SEPARATOR = " ";
const PROCESS_EXIT_UNAVAILABLE = -1;
const PACKAGED_CLI_DIRECTORY = "bin";
const PACKAGED_CLI_FILENAME = "spx.js";
const PIPELINE_SUBPROCESS_TIMEOUT_MS = 120_000;
const STREAMING_OBSERVATION_DELAY_MS = 50;
const SYNTHETIC_STAGE_FAILURE_DETAIL = "synthetic validation stage detail";
const LITERAL_SKIP_SOURCE_SEGMENTS = ["src", "literal-skip.ts"] as const;
const CIRCULAR_SKIP_A_SOURCE_SEGMENTS = ["src", "circular-skip-a.ts"] as const;
const CIRCULAR_SKIP_B_SOURCE_SEGMENTS = ["src", "circular-skip-b.ts"] as const;
const CIRCULAR_DEPENDENCY_DETAIL_A_TO_B = "src/a.ts → src/b.ts → src/a.ts";
const CIRCULAR_DEPENDENCY_DETAIL_B_TO_A = "src/b.ts → src/a.ts → src/b.ts";
const LITERAL_SKIP_TEST_SEGMENTS = [
  "spx",
  "21-literal-skip.enabler",
  "tests",
  "literal-skip.scenario.l1.test.ts",
] as const;
const TEST_DIRECTORY_NAME = "tests" as const;
const LITERAL_SKIP_TOKEN = "validation-all-skip-literal-token";
const TYPE_ERROR_SOURCE_SEGMENTS = ["src", "has-type-error.ts"] as const;
const PRODUCTION_SCOPE_FILE_PATTERN = "src/**/*";
const SCRIPT_SOURCE_DIRECTORY_NAME = "scripts";
const NARROW_SOURCE_DIRECTORY_NAME = "api";
const DEEP_SOURCE_DIRECTORY_NAME = "deeper";
const NESTED_SOURCE_DIRECTORY_NAME = "validation-nested";
const DOTTED_SOURCE_DIRECTORY_NAME = "feature.dir";
const NARROW_PRODUCTION_SCOPE_FILE_PATTERN = "src/api/**/*.ts";
const NARROW_SINGLE_LEVEL_TYPESCRIPT_SOURCE_FILE_PATTERN = "src/api/*.ts";
const TYPESCRIPT_ONLY_SOURCE_FILE_PATTERN = "src/**/*.ts";
const NESTED_FEATURE_SOURCE_DIRECTORY_NAME = "feature";
const NESTED_FEATURE_SOURCE_FILE_PATTERN = "src/**/feature/*.ts";
const NARROW_NESTED_FEATURE_SOURCE_FILE_PATTERN = "src/api/**/feature/*.ts";
const TEST_SCOPE_FILE_PATTERN = `${TEST_DIRECTORY_NAME}/**/*`;
// Mirrors an actual tsconfig.production.json exclude entry.
const PRODUCTION_SCOPE_EXCLUDE_PATTERN = "docs/**/*";
const TEST_FILE_EXCLUDE_PATTERN = "**/*.test.ts";
const TYPESCRIPT_JSX_SOURCE_FILE_PATTERN = "src/**/*.tsx";
const MODERN_SOURCE_FILE_PATTERN = "src/**/*.mts";
const COMMONJS_SOURCE_FILE_PATTERN = "src/**/*.cts";
const PREFIXED_DEPENDENCY_EXCLUDE_PATTERN = "dist/**";
const PREFIXED_DEPENDENCY_EXCLUDED_FILE = "dist/generated.ts";
const RECURSIVE_DEPENDENCY_EXCLUDE_PATTERN = "src/**/generated/**/*";
const RECURSIVE_DEPENDENCY_ROOT_DIRECTORY_NAME = "generated";
const RECURSIVE_DEPENDENCY_ROOT_EXCLUDED_FILE = "src/generated/output.ts";
const RECURSIVE_DEPENDENCY_NESTED_EXCLUDED_FILE = "src/feature/generated/output.ts";
const ABSENT_SCOPE_FILE_PATTERN = "scripts/**/*";
const TYPESCRIPT_JSX_SOURCE_FILE_NAME = "component.tsx";
const MODERN_SOURCE_FILE_NAME = "modern.mts";
const COMMONJS_SOURCE_FILE_NAME = "commonjs.cts";
const CLEAN_SOURCE_FILE_NAME = "clean.ts";
const DOT_PREFIXED_ROOT_SOURCE_FILE_NAME = "..foo.ts";
const DECLARATION_SOURCE_FILE_NAME = "types.d.ts";
const MODERN_DECLARATION_SOURCE_FILE_NAME = "types.d.mts";
const COMMONJS_DECLARATION_SOURCE_FILE_NAME = "types.d.cts";
const EXTENSIONLESS_SOURCE_FILE_NAME = "README";
const RECURSIVE_NAMED_SOURCE_FILE_PATTERN = `src/**/${CLEAN_SOURCE_FILE_NAME}`;
const ROOT_TYPESCRIPT_SOURCE_FILE_PATTERN = "*.ts";
const SINGLE_LEVEL_NAMED_SOURCE_FILE_PATTERN = `src/*/${CLEAN_SOURCE_FILE_NAME}`;
const RECURSIVE_MARKDOWN_SOURCE_FILE_PATTERN = "src/**/*.md";
const SINGLE_CHARACTER_SOURCE_INCLUDE_PATTERN = `src/?/${CLEAN_SOURCE_FILE_NAME}`;
const SINGLE_CHARACTER_SOURCE_EXCLUDE_PATTERN = "src/?/ignored.ts";
const RECURSIVE_GLOB_STRESS_SEGMENT = "**";
const RECURSIVE_GLOB_STRESS_SEGMENT_COUNT = 12;
const RECURSIVE_GLOB_STRESS_PATTERN = [
  ...Array.from({ length: RECURSIVE_GLOB_STRESS_SEGMENT_COUNT }, () => RECURSIVE_GLOB_STRESS_SEGMENT),
  "target.ts",
].join("/");
const RECURSIVE_GLOB_STRESS_DIRECTORY = [
  "src",
  "segment-a",
  "segment-b",
  "segment-c",
  "segment-d",
  "segment-e",
  "segment-f",
  "segment-g",
  "segment-h",
  "segment-i",
  "segment-j",
  "segment-k",
  "segment-l",
  "segment-m",
  "segment-n",
  "segment-o",
].join("/");
const MARKDOWN_ONLY_DIRECTORY_NAME = "docs";
const MARKDOWN_ONLY_FILE_NAME = "readme.md";
const MARKDOWN_ONLY_FILE_PATTERN = `${MARKDOWN_ONLY_DIRECTORY_NAME}/**/*.md`;
const VALIDATION_CONFIG_FILENAME = "spx.config.yaml";
const SECONDARY_SOURCE_DIRECTORY_NAME = "api";
const SECONDARY_SOURCE_FILE_NAME = "secondary.ts";
const SECONDARY_SOURCE_CONTENT = "export const secondary = true;\n";
const SECONDARY_TYPE_ERROR_SOURCE_CONTENT = "export const secondary: number = \"bad\";\n";
const GENERATED_VALID_SOURCE_CONTENT = "export const generatedValidationValue = true;\n";
const EXCLUDED_SOURCE_DIRECTORY_NAME = "private";
const EXCLUDED_SOURCE_FILE_NAME = "excluded.ts";
const NARROWED_SOURCE_DIRECTORY_NAME = "generated";
const NARROWED_SOURCE_FILE_NAME = "narrowed.ts";
const FIXTURE_TEXT_ENCODING = "utf8";
const OUT_OF_SCOPE_MARKDOWN_DIRECTORY_NAME = "docs";
const OUT_OF_SCOPE_MARKDOWN_FILE_NAME = "unformatted.md";
const OUT_OF_SCOPE_MARKDOWN_CONTENT = "# Broken\n\n[missing](./missing.md)\n";
const MISSING_SOURCE_DIRECTORY_NAME = "missing";
const TYPE_ERROR_REPLACEMENT_PATTERN = /const x:\s*number\s*=\s*"[^"]+";?/g;
const TYPE_ERROR_REPLACEMENT = "const x: number = 0;";
const OUTPUT_LINE_SEPARATOR = "\n";
const VALIDATION_STEP_OUTCOME_PASS = "pass";
const VALIDATION_STEP_OUTCOME_SKIP = "skip";
const VALIDATION_STEP_OUTCOME_FAIL = "fail";
const CIRCULAR_OVERRIDE = validationStageOverride(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR);
const LITERAL_OVERRIDE = validationStageOverride(VALIDATION_STAGE_DISPLAY_NAMES.LITERAL);
const SKIPPED_JSON_PREFIX = "{\"skipped\":true,\"reason\":\"";
const SKIPPED_JSON_SUFFIX = "\"}";
const DPRINT_TYPESCRIPT_PLUGIN =
  "https://plugins.dprint.dev/typescript-0.95.13.wasm@d353247b160c1e81eb043930de6f940adcd3d713651221d3a0284d4c30ea43c4";
const CLEAN_FORMATTING_CONFIG_CONTENT = `${
  JSON.stringify(
    {
      includes: [PRODUCTION_SCOPE_FILE_PATTERN],
      typescript: {},
      plugins: [DPRINT_TYPESCRIPT_PLUGIN],
    },
    null,
    2,
  )
}\n`;

function validationStageOverride(stageName: string): ValidationStageParticipationOverride {
  const stage = validationPipelineStages.find((candidate) => candidate.name === stageName);
  const override = stage?.participation.override;
  if (override === undefined) {
    throw new Error(`Validation stage ${stageName} does not declare a full-pipeline override`);
  }
  return override;
}

export interface ValidationCliPropertyOptions {
  readonly numRuns: number;
  readonly timeout: number;
}

export interface ValidationSubprocessScenario {
  readonly title: string;
  readonly fixture: FixtureName;
  readonly args: readonly string[];
  readonly timeout: number;
  readonly expectedExitCode?: number;
  readonly unexpectedExitCode?: number;
  readonly stdoutIncludes: readonly string[];
  readonly combinedIncludes: readonly string[];
  readonly stdoutExcludes: readonly string[];
  readonly stderrExcludes: readonly string[];
  readonly combinedExcludes: readonly string[];
}

export interface GeneratedValidationStageSpec {
  readonly name: string;
  readonly exitCode: number;
  readonly failsPipeline: boolean;
  readonly output: string;
}

export interface GeneratedRegisteredValidationStageOutcome {
  readonly exitCode: number;
  readonly output: string;
}

export interface GeneratedValidationStageSet {
  readonly base: readonly GeneratedValidationStageSpec[];
  readonly added: GeneratedValidationStageSpec;
  readonly insertionIndex: number;
}

export interface GeneratedValidationStageInsertion {
  readonly added: GeneratedValidationStageSpec;
  readonly insertionIndex: number;
}

export interface ValidationPipelineProjectCase {
  readonly title: string;
  readonly fixture: FixtureName;
  readonly args: readonly string[];
  readonly generatedFiles: readonly GeneratedValidationProjectFile[];
  readonly scope?: ValidationScope;
  readonly files?: readonly string[];
}

export interface GeneratedValidationProjectFile {
  readonly path: string;
  readonly content: string;
}

export interface GeneratedValidationStageInsertionCase {
  readonly projectCase: ValidationPipelineProjectCase;
  readonly insertion: GeneratedValidationStageInsertion;
}

export interface ExtensionSpecificExcludeScenario {
  readonly excludePattern: string;
  readonly sourceFileName: string;
}

export const VALIDATION_PIPELINE_SCENARIO_KIND = {
  CLEAN_PROJECT: "cleanProject",
  FAILURE_IDENTIFIES_STEP: "failureIdentifiesStep",
  PRODUCTION_SCOPE: "productionScope",
  PATH_DIRECTORY_SCOPE: "pathDirectoryScope",
  PATH_FILE_SCOPE: "pathFileScope",
  STEP_ORDER: "stepOrder",
  SKIP_CIRCULAR: "skipCircular",
  SKIP_LITERAL: "skipLiteral",
  NO_SHORT_CIRCUIT: "noShortCircuit",
  FAILURE_EXIT_CODE: "failureExitCode",
  STEP_DURATION: "stepDuration",
} as const;

export type ValidationPipelineScenarioKind =
  (typeof VALIDATION_PIPELINE_SCENARIO_KIND)[keyof typeof VALIDATION_PIPELINE_SCENARIO_KIND];

export interface ValidationPipelineScenario {
  readonly title: string;
  readonly kind: ValidationPipelineScenarioKind;
  readonly timeout: number;
}

const EXTENSION_SPECIFIC_EXCLUDE_SCENARIOS: readonly ExtensionSpecificExcludeScenario[] = [
  {
    excludePattern: TYPESCRIPT_JSX_SOURCE_FILE_PATTERN,
    sourceFileName: TYPESCRIPT_JSX_SOURCE_FILE_NAME,
  },
  {
    excludePattern: MODERN_SOURCE_FILE_PATTERN,
    sourceFileName: MODERN_SOURCE_FILE_NAME,
  },
  {
    excludePattern: COMMONJS_SOURCE_FILE_PATTERN,
    sourceFileName: COMMONJS_SOURCE_FILE_NAME,
  },
];

export const VALIDATION_PIPELINE_DATA = {
  allTimeout: PIPELINE_SUBPROCESS_TIMEOUT_MS,
  streamingObservationDelayMs: STREAMING_OBSERVATION_DELAY_MS,
  totalSteps: VALIDATION_PIPELINE_TOTAL_STEPS,
  stepLinePattern: VALIDATION_STEP_LINE_PATTERN,
  stepDurationPattern: VALIDATION_STEP_DURATION_PATTERN,
  expectedStepNumbers: Array.from({ length: VALIDATION_PIPELINE_TOTAL_STEPS }, (_, index) => index + 1),
  // Every pipeline step except the TypeScript type-check stage keeps its verdict
  // when a type error is fixed. Derived from the registry by excluding that one
  // stage, so inserting or reordering stages updates the set without staling a
  // hardcoded index list.
  stepsIndependentOfTypeScript: validationPipelineStages
    .map((stage, index) => ({ stepNumber: index + 1, stageName: stage.name }))
    .filter((step) => step.stageName !== VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT)
    .map((step) => step.stepNumber),
  outputLineSeparator: OUTPUT_LINE_SEPARATOR,
  stageNames: VALIDATION_STAGE_DISPLAY_NAMES,
  exitCodes: VALIDATION_EXIT_CODES,
  summaryStatus: VALIDATION_SUMMARY_STATUS,
  syntheticStageFailureDetail: SYNTHETIC_STAGE_FAILURE_DETAIL,
  circularOutput: {
    ...CIRCULAR_DEPENDENCY_OUTPUT,
    DETAIL_A_TO_B: CIRCULAR_DEPENDENCY_DETAIL_A_TO_B,
    DETAIL_B_TO_A: CIRCULAR_DEPENDENCY_DETAIL_B_TO_A,
  },
  circularSkipOutput: `${VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR}: skipped (${CIRCULAR_OVERRIDE.flag})`,
  circularSkipJsonOutput: `${SKIPPED_JSON_PREFIX}${CIRCULAR_OVERRIDE.reason}${SKIPPED_JSON_SUFFIX}`,
  skipCircularFlag: CIRCULAR_OVERRIDE.flag,
  literalSkipOutput: `${VALIDATION_STAGE_DISPLAY_NAMES.LITERAL}: skipped (${LITERAL_OVERRIDE.flag})`,
  literalSkipJsonOutput: `${SKIPPED_JSON_PREFIX}${LITERAL_OVERRIDE.reason}${SKIPPED_JSON_SUFFIX}`,
  skipLiteralFlag: LITERAL_OVERRIDE.flag,
  formattingConfigFileName: DPRINT_CONFIG_FILENAME,
  cleanFormattingConfigContent: CLEAN_FORMATTING_CONFIG_CONTENT,
  quietFlag: "--quiet",
  jsonFlag: "--json",
  scopeFlag: "--scope",
  productionScope: "production",
  productionScopeFilePattern: PRODUCTION_SCOPE_FILE_PATTERN,
  scriptSourceDirectoryName: SCRIPT_SOURCE_DIRECTORY_NAME,
  narrowSourceDirectoryName: NARROW_SOURCE_DIRECTORY_NAME,
  deepSourceDirectoryName: DEEP_SOURCE_DIRECTORY_NAME,
  nestedSourceDirectoryName: NESTED_SOURCE_DIRECTORY_NAME,
  dottedSourceDirectoryName: DOTTED_SOURCE_DIRECTORY_NAME,
  narrowProductionScopeFilePattern: NARROW_PRODUCTION_SCOPE_FILE_PATTERN,
  narrowSingleLevelTypeScriptSourceFilePattern: NARROW_SINGLE_LEVEL_TYPESCRIPT_SOURCE_FILE_PATTERN,
  typeScriptOnlySourceFilePattern: TYPESCRIPT_ONLY_SOURCE_FILE_PATTERN,
  nestedFeatureSourceDirectoryName: NESTED_FEATURE_SOURCE_DIRECTORY_NAME,
  nestedFeatureSourceFilePattern: NESTED_FEATURE_SOURCE_FILE_PATTERN,
  narrowNestedFeatureSourceFilePattern: NARROW_NESTED_FEATURE_SOURCE_FILE_PATTERN,
  testDirectoryName: TEST_DIRECTORY_NAME,
  testScopeFilePattern: TEST_SCOPE_FILE_PATTERN,
  productionScopeExcludePattern: PRODUCTION_SCOPE_EXCLUDE_PATTERN,
  testFileExcludePattern: TEST_FILE_EXCLUDE_PATTERN,
  typeScriptJsxSourceFilePattern: TYPESCRIPT_JSX_SOURCE_FILE_PATTERN,
  modernSourceFilePattern: MODERN_SOURCE_FILE_PATTERN,
  commonjsSourceFilePattern: COMMONJS_SOURCE_FILE_PATTERN,
  prefixedDependencyExcludePattern: PREFIXED_DEPENDENCY_EXCLUDE_PATTERN,
  prefixedDependencyExcludedFile: PREFIXED_DEPENDENCY_EXCLUDED_FILE,
  recursiveDependencyExcludePattern: RECURSIVE_DEPENDENCY_EXCLUDE_PATTERN,
  recursiveDependencyRootDirectoryName: RECURSIVE_DEPENDENCY_ROOT_DIRECTORY_NAME,
  recursiveDependencyRootExcludedFile: RECURSIVE_DEPENDENCY_ROOT_EXCLUDED_FILE,
  recursiveDependencyNestedExcludedFile: RECURSIVE_DEPENDENCY_NESTED_EXCLUDED_FILE,
  absentScopeFilePattern: ABSENT_SCOPE_FILE_PATTERN,
  fullTsconfigFile: TSCONFIG_FILES.full,
  sourceDirectoryName: "src",
  cleanSourceFileName: CLEAN_SOURCE_FILE_NAME,
  dotPrefixedRootSourceFileName: DOT_PREFIXED_ROOT_SOURCE_FILE_NAME,
  typeScriptJsxSourceFileName: TYPESCRIPT_JSX_SOURCE_FILE_NAME,
  modernSourceFileName: MODERN_SOURCE_FILE_NAME,
  commonjsSourceFileName: COMMONJS_SOURCE_FILE_NAME,
  declarationSourceFileName: DECLARATION_SOURCE_FILE_NAME,
  modernDeclarationSourceFileName: MODERN_DECLARATION_SOURCE_FILE_NAME,
  commonjsDeclarationSourceFileName: COMMONJS_DECLARATION_SOURCE_FILE_NAME,
  extensionlessSourceFileName: EXTENSIONLESS_SOURCE_FILE_NAME,
  extensionSpecificExcludeScenarios: EXTENSION_SPECIFIC_EXCLUDE_SCENARIOS,
  recursiveNamedSourceFilePattern: RECURSIVE_NAMED_SOURCE_FILE_PATTERN,
  rootTypeScriptSourceFilePattern: ROOT_TYPESCRIPT_SOURCE_FILE_PATTERN,
  singleLevelNamedSourceFilePattern: SINGLE_LEVEL_NAMED_SOURCE_FILE_PATTERN,
  recursiveMarkdownSourceFilePattern: RECURSIVE_MARKDOWN_SOURCE_FILE_PATTERN,
  singleCharacterSourceIncludePattern: SINGLE_CHARACTER_SOURCE_INCLUDE_PATTERN,
  singleCharacterSourceExcludePattern: SINGLE_CHARACTER_SOURCE_EXCLUDE_PATTERN,
  recursiveGlobStressPattern: RECURSIVE_GLOB_STRESS_PATTERN,
  recursiveGlobStressDirectory: RECURSIVE_GLOB_STRESS_DIRECTORY,
  markdownOnlyDirectoryName: MARKDOWN_ONLY_DIRECTORY_NAME,
  markdownOnlyFileName: MARKDOWN_ONLY_FILE_NAME,
  markdownOnlyFilePattern: MARKDOWN_ONLY_FILE_PATTERN,
  validationConfigFilename: VALIDATION_CONFIG_FILENAME,
  secondarySourceDirectoryName: SECONDARY_SOURCE_DIRECTORY_NAME,
  secondarySourceFileName: SECONDARY_SOURCE_FILE_NAME,
  secondarySourceContent: SECONDARY_SOURCE_CONTENT,
  secondaryTypeErrorSourceContent: SECONDARY_TYPE_ERROR_SOURCE_CONTENT,
  excludedSourceDirectoryName: EXCLUDED_SOURCE_DIRECTORY_NAME,
  excludedSourceFileName: EXCLUDED_SOURCE_FILE_NAME,
  narrowedSourceDirectoryName: NARROWED_SOURCE_DIRECTORY_NAME,
  narrowedSourceFileName: NARROWED_SOURCE_FILE_NAME,
  fixtureTextEncoding: FIXTURE_TEXT_ENCODING,
  outOfScopeMarkdownDirectoryName: OUT_OF_SCOPE_MARKDOWN_DIRECTORY_NAME,
  outOfScopeMarkdownFileName: OUT_OF_SCOPE_MARKDOWN_FILE_NAME,
  outOfScopeMarkdownContent: OUT_OF_SCOPE_MARKDOWN_CONTENT,
  missingSourceDirectoryName: MISSING_SOURCE_DIRECTORY_NAME,
  circularSkipASourceSegments: CIRCULAR_SKIP_A_SOURCE_SEGMENTS,
  circularSkipBSourceSegments: CIRCULAR_SKIP_B_SOURCE_SEGMENTS,
  literalSkipSourceSegments: LITERAL_SKIP_SOURCE_SEGMENTS,
  literalSkipTestSegments: LITERAL_SKIP_TEST_SEGMENTS,
  literalSkipToken: LITERAL_SKIP_TOKEN,
  productionTsconfigFile: TSCONFIG_FILES.production,
  productionTsconfigContent: JSON.stringify({
    extends: `./${TSCONFIG_FILES.full}`,
    include: [PRODUCTION_SCOPE_FILE_PATTERN],
  }),
  typeErrorSourceSegments: TYPE_ERROR_SOURCE_SEGMENTS,
  typeErrorReplacementPattern: TYPE_ERROR_REPLACEMENT_PATTERN,
  typeErrorReplacement: TYPE_ERROR_REPLACEMENT,
  scopeResolutionDirectoryName: "validation-scope-fixture",
  scopeResolutionSourceFile: "validation-scope-fixture/index.ts",
  escapingPathOperand: ESCAPING_PATH_OPERAND,
  outcome: {
    pass: VALIDATION_STEP_OUTCOME_PASS,
    skip: VALIDATION_STEP_OUTCOME_SKIP,
    fail: VALIDATION_STEP_OUTCOME_FAIL,
  },
} as const;

export type ValidationStepOutcome =
  (typeof VALIDATION_PIPELINE_DATA.outcome)[keyof typeof VALIDATION_PIPELINE_DATA.outcome];

export function arbitraryValidationCliUnknownSubcommand(): fc.Arbitrary<string> {
  return fc.oneof(
    arbitraryDomainLiteral()
      .filter((candidate) => !validationKnownOperands.has(candidate))
      .filter((candidate) => !candidate.startsWith(validationOptionPrefix)),
    arbitraryDomainLiteral()
      .map((candidate) => ` ${candidate}\t`)
      .filter((candidate) => !validationKnownOperands.has(candidate.trim()))
      .filter((candidate) => !candidate.trim().startsWith(validationOptionPrefix)),
    fc.constantFrom("???", "literal:bad", "unknown/subcommand", "unicodeé\x01stage"),
  )
    .filter((candidate) => !validationKnownOperands.has(candidate))
    .filter((candidate) => !candidate.startsWith(validationOptionPrefix));
}

export function arbitraryValidationCliEmptyArgument(): fc.Arbitrary<string> {
  return fc.constant(EMPTY_CLI_ARGUMENT);
}

export function arbitraryValidationCliControlArgument(): fc.Arbitrary<string> {
  return fc.shuffledSubarray([...CONTROL_ARGUMENT_PARTS], {
    minLength: CONTROL_ARGUMENT_PARTS.length,
    maxLength: CONTROL_ARGUMENT_PARTS.length,
  }).map((parts) => parts.join(EMPTY_CLI_ARGUMENT));
}

export function arbitraryValidationCliUnicodeArgument(): fc.Arbitrary<string> {
  return fc.shuffledSubarray([...UNICODE_ARGUMENT_PARTS], {
    minLength: UNICODE_ARGUMENT_PARTS.length,
    maxLength: UNICODE_ARGUMENT_PARTS.length,
  }).map((parts) => parts.join(EMPTY_CLI_ARGUMENT))
    .filter((candidate) => !validationKnownOperands.has(candidate));
}

export function arbitraryInvalidLiteralProblemKind(): fc.Arbitrary<string> {
  return fc.oneof(
    arbitraryDomainLiteral(),
    arbitraryValidationCliControlArgument(),
  ).filter((candidate) => !LITERAL_PROBLEM_KINDS.includes(candidate as LiteralProblemKindCandidate));
}

export function arbitraryValidationCliSubprocessTimeout(): fc.Arbitrary<number> {
  return fc.integer({ min: SUBPROCESS_TIMEOUT_MS_MIN, max: SUBPROCESS_TIMEOUT_MS_MAX });
}

export function arbitraryValidationCliPropertyOptions(): fc.Arbitrary<ValidationCliPropertyOptions> {
  return fc.record({
    numRuns: fc.integer({ min: PROPERTY_RUN_COUNT_MIN, max: PROPERTY_RUN_COUNT_MAX }),
    timeout: fc.integer({ min: PROPERTY_TIMEOUT_MS_MIN, max: PROPERTY_TIMEOUT_MS_MAX }),
  });
}

export function arbitraryGeneratedValidationStageSpec(): fc.Arbitrary<GeneratedValidationStageSpec> {
  return fc.record({
    name: arbitraryDomainLiteral().map((value) => `Generated validation stage ${value}`),
    exitCode: fc.constantFrom(VALIDATION_EXIT_CODES.SUCCESS, VALIDATION_EXIT_CODES.FAILURE),
    failsPipeline: fc.boolean(),
    output: fc.constantFrom("✓ Generated validation stage passed", "✗ Generated validation stage failed"),
  });
}

export function arbitraryGeneratedValidationStageSpecs(): fc.Arbitrary<readonly GeneratedValidationStageSpec[]> {
  return fc.uniqueArray(
    arbitraryGeneratedValidationStageSpec(),
    {
      minLength: 1,
      maxLength: 5,
      selector: (stage) => stage.name,
    },
  );
}

export function arbitraryRegisteredValidationStageOutcomes(): fc.Arbitrary<
  readonly GeneratedRegisteredValidationStageOutcome[]
> {
  return fc.array(
    fc.record({
      exitCode: fc.constantFrom(VALIDATION_EXIT_CODES.SUCCESS, VALIDATION_EXIT_CODES.FAILURE),
      output: fc.constantFrom("✓ Registered validation stage passed", "✗ Registered validation stage failed"),
    }),
    {
      minLength: validationPipelineStages.length,
      maxLength: validationPipelineStages.length,
    },
  );
}

export function arbitraryGeneratedValidationStageSet(): fc.Arbitrary<GeneratedValidationStageSet> {
  return arbitraryGeneratedValidationStageSpecs().chain((base) =>
    arbitraryGeneratedValidationStageSpec()
      .filter((added) => !base.some((stage) => stage.name === added.name))
      .chain((added) =>
        fc.record({
          base: fc.constant(base),
          added: fc.constant(added),
          insertionIndex: fc.integer({ min: 0, max: base.length }),
        })
      )
  );
}

export function arbitraryGeneratedValidationStageInsertion(
  maxInsertionIndex: number,
): fc.Arbitrary<GeneratedValidationStageInsertion> {
  return fc.record({
    added: arbitraryGeneratedValidationStageSpec(),
    insertionIndex: fc.integer({ min: 0, max: maxInsertionIndex }),
  });
}

export function arbitraryValidationPipelineProjectCase(): fc.Arbitrary<ValidationPipelineProjectCase> {
  return fc.record({
    explicitFileScope: fc.boolean(),
    sourceFilePath: arbitrarySourceFilePath(),
  }).map(({ explicitFileScope, sourceFilePath }) => ({
    title: explicitFileScope
      ? "generated clean project explicit file validation scope"
      : "generated clean project full validation scope",
    fixture: PROJECT_FIXTURES.CLEAN_PROJECT,
    args: explicitFileScope ? [sourceFilePath] : [],
    ...(explicitFileScope ? { files: [sourceFilePath] } : {}),
    generatedFiles: [{
      path: sourceFilePath,
      content: GENERATED_VALID_SOURCE_CONTENT,
    }],
  }));
}

export function arbitraryGeneratedValidationStageInsertionCase(
  maxInsertionIndex: number,
): fc.Arbitrary<GeneratedValidationStageInsertionCase> {
  return fc.record({
    projectCase: arbitraryValidationPipelineProjectCase(),
    insertion: arbitraryGeneratedValidationStageInsertion(maxInsertionIndex),
  });
}

export function validationCliSuccessExitCodeUpperBound(): number {
  return validationCliDefinition.diagnostics.unknownSubcommand.exitCode;
}

export function validationCliEmptyOutputLength(): number {
  return EMPTY_CLI_ARGUMENT.length;
}

export function validationCliTempDirectoryPrefix(): string {
  return VALIDATION_CLI_TEMP_PREFIX;
}

export function validationCliOptionOperandSeparator(): string {
  return OPTION_OPERAND_SEPARATOR;
}

export function validationCliUnavailableExitCode(): number {
  return PROCESS_EXIT_UNAVAILABLE;
}

export function validationCliPackagedExecutablePath(): string {
  return resolve(CONFIG_PROCESS_CWD.read(), PACKAGED_CLI_DIRECTORY, PACKAGED_CLI_FILENAME);
}

export function validationLintSubprocessScenarios(): ValidationSubprocessScenario[] {
  const args = [validationCliDefinition.subcommands.lint.commandName];
  const runtimeAntiMarkers = Object.values(VALIDATION_RUNTIME_ANTI_MARKERS);
  const lintSkip = formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.ESLINT);

  return [
    {
      title: "clean TypeScript fixture runs ESLint",
      fixture: PROJECT_FIXTURES.CLEAN_PROJECT,
      args,
      timeout: HARNESS_TIMEOUT,
      expectedExitCode: VALIDATION_EXIT_CODES.SUCCESS,
      stdoutIncludes: [VALIDATION_STAGE_DISPLAY_NAMES.ESLINT],
      combinedIncludes: [],
      stdoutExcludes: [lintSkip, ...runtimeAntiMarkers],
      stderrExcludes: runtimeAntiMarkers,
      combinedExcludes: runtimeAntiMarkers,
    },
    {
      title: "Python fixture skips ESLint",
      fixture: PROJECT_FIXTURES.PYTHON_PROJECT,
      args,
      timeout: HARNESS_TIMEOUT,
      expectedExitCode: VALIDATION_EXIT_CODES.SUCCESS,
      stdoutIncludes: [lintSkip],
      combinedIncludes: [],
      stdoutExcludes: runtimeAntiMarkers,
      stderrExcludes: runtimeAntiMarkers,
      combinedExcludes: runtimeAntiMarkers,
    },
    {
      title: "bare fixture skips ESLint",
      fixture: PROJECT_FIXTURES.BARE_PROJECT,
      args,
      timeout: HARNESS_TIMEOUT,
      expectedExitCode: VALIDATION_EXIT_CODES.SUCCESS,
      stdoutIncludes: [lintSkip],
      combinedIncludes: [],
      stdoutExcludes: runtimeAntiMarkers,
      stderrExcludes: runtimeAntiMarkers,
      combinedExcludes: runtimeAntiMarkers,
    },
    {
      title: "TypeScript fixture without ESLint config reports the missing config",
      fixture: PROJECT_FIXTURES.TYPESCRIPT_NO_ESLINT,
      args,
      timeout: HARNESS_TIMEOUT,
      unexpectedExitCode: VALIDATION_EXIT_CODES.SUCCESS,
      stdoutIncludes: [],
      combinedIncludes: [VALIDATION_COMMAND_OUTPUT.ESLINT_MISSING_CONFIG],
      stdoutExcludes: runtimeAntiMarkers,
      stderrExcludes: runtimeAntiMarkers,
      combinedExcludes: runtimeAntiMarkers,
    },
  ];
}

export function validationAllTypeScriptScenarioEvidence(): ValidationSubprocessScenario {
  const args = [validationCliDefinition.subcommands.all.commandName];
  const runtimeAntiMarkers = Object.values(VALIDATION_RUNTIME_ANTI_MARKERS);

  return {
    title: "clean TypeScript fixture runs every validation stage",
    fixture: PROJECT_FIXTURES.CLEAN_PROJECT,
    args,
    timeout: PIPELINE_SUBPROCESS_TIMEOUT_MS,
    expectedExitCode: VALIDATION_EXIT_CODES.SUCCESS,
    stdoutIncludes: [
      VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND,
      VALIDATION_COMMAND_OUTPUT.KNIP_DISABLED,
      VALIDATION_COMMAND_OUTPUT.ESLINT_SUCCESS,
      VALIDATION_COMMAND_OUTPUT.TYPESCRIPT_SUCCESS,
      NO_PROBLEMS_MESSAGE,
    ],
    combinedIncludes: [],
    stdoutExcludes: runtimeAntiMarkers,
    stderrExcludes: runtimeAntiMarkers,
    combinedExcludes: runtimeAntiMarkers,
  };
}

export function validationAllTypeScriptComplianceEvidence(): ValidationSubprocessScenario {
  const runtimeAntiMarkers = Object.values(VALIDATION_RUNTIME_ANTI_MARKERS);
  return {
    title: "TypeScript-absent fixture skips every TypeScript validation stage",
    fixture: PROJECT_FIXTURES.PYTHON_PROJECT,
    args: [validationCliDefinition.subcommands.all.commandName],
    timeout: HARNESS_TIMEOUT,
    expectedExitCode: VALIDATION_EXIT_CODES.SUCCESS,
    stdoutIncludes: typescriptValidationLanguage.stages.map((stage) => formatTypeScriptAbsentSkipMessage(stage.name)),
    combinedIncludes: [],
    stdoutExcludes: runtimeAntiMarkers,
    stderrExcludes: runtimeAntiMarkers,
    combinedExcludes: runtimeAntiMarkers,
  };
}

export function validationPipelineScenarios(): ValidationPipelineScenario[] {
  return [
    {
      title: "clean project passes the full validation pipeline",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.CLEAN_PROJECT,
      timeout: VALIDATION_PIPELINE_DATA.allTimeout,
    },
    {
      title: "pipeline failure output identifies the failed step",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.FAILURE_IDENTIFIES_STEP,
      timeout: VALIDATION_PIPELINE_DATA.allTimeout,
    },
    {
      title: "production scope runs every step in sequence",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.PRODUCTION_SCOPE,
      timeout: VALIDATION_PIPELINE_DATA.allTimeout,
    },
    {
      title: "path directory scope runs every step in sequence",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.PATH_DIRECTORY_SCOPE,
      timeout: VALIDATION_PIPELINE_DATA.allTimeout,
    },
    {
      title: "path file scope runs every step in sequence",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.PATH_FILE_SCOPE,
      timeout: VALIDATION_PIPELINE_DATA.allTimeout,
    },
    {
      title: "step completion lines stay in pipeline order",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.STEP_ORDER,
      timeout: VALIDATION_PIPELINE_DATA.allTimeout,
    },
    {
      title: "skip circular suppresses circular detection and respects quiet and json output",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.SKIP_CIRCULAR,
      timeout: VALIDATION_PIPELINE_DATA.allTimeout,
    },
    {
      title: "skip literal suppresses literal detection and respects quiet and json output",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.SKIP_LITERAL,
      timeout: VALIDATION_PIPELINE_DATA.allTimeout,
    },
    {
      title: "later steps still run after the first step fails",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.NO_SHORT_CIRCUIT,
      timeout: VALIDATION_PIPELINE_DATA.allTimeout,
    },
    {
      title: "any step failure makes the pipeline exit non-zero",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.FAILURE_EXIT_CODE,
      timeout: VALIDATION_PIPELINE_DATA.allTimeout,
    },
    {
      title: "every step line carries a duration annotation",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.STEP_DURATION,
      timeout: VALIDATION_PIPELINE_DATA.allTimeout,
    },
  ];
}

export function validationPipelineBehaviorScenarios(): ValidationPipelineScenario[] {
  return validationPipelineScenarios().filter((scenario) =>
    !validationPipelineComplianceScenarioKinds().has(scenario.kind)
  );
}

export function validationPipelineComplianceScenarios(): ValidationPipelineScenario[] {
  return validationPipelineScenarios().filter((scenario) =>
    validationPipelineComplianceScenarioKinds().has(scenario.kind)
  );
}

function validationPipelineComplianceScenarioKinds(): ReadonlySet<ValidationPipelineScenarioKind> {
  return new Set([
    VALIDATION_PIPELINE_SCENARIO_KIND.NO_SHORT_CIRCUIT,
    VALIDATION_PIPELINE_SCENARIO_KIND.FAILURE_EXIT_CODE,
    VALIDATION_PIPELINE_SCENARIO_KIND.STEP_DURATION,
  ]);
}

export const VALIDATION_CLI_GENERATOR = {
  unknownSubcommand: arbitraryValidationCliUnknownSubcommand,
  emptyArgument: arbitraryValidationCliEmptyArgument,
  controlArgument: arbitraryValidationCliControlArgument,
  unicodeArgument: arbitraryValidationCliUnicodeArgument,
  invalidLiteralProblemKind: arbitraryInvalidLiteralProblemKind,
  subprocessTimeout: arbitraryValidationCliSubprocessTimeout,
  propertyOptions: arbitraryValidationCliPropertyOptions,
} as const;

type LiteralProblemKindCandidate = (typeof LITERAL_PROBLEM_KINDS)[number];
