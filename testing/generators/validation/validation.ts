import * as fc from "fast-check";
import { resolve } from "node:path";

import { CIRCULAR_DEPENDENCY_OUTPUT } from "@/commands/validation/circular";
import { VALIDATION_SUMMARY_STATUS } from "@/commands/validation/format";
import { NO_PROBLEMS_MESSAGE } from "@/commands/validation/literal";
import {
  formatTypeScriptAbsentSkipMessage,
  formatValidationStageSkipJsonOutput,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_EXIT_CODES,
  VALIDATION_STAGE_DISPLAY_NAMES,
  VALIDATION_STEP_DURATION_PATTERN,
  VALIDATION_STEP_LINE_PATTERN,
} from "@/commands/validation/messages";
import { VALIDATION_RUNTIME_ANTI_MARKERS } from "@/commands/validation/runtime-diagnostics";
import { LITERAL_PROBLEM_KIND } from "@/domains/validation/literal-problem-kind";
import {
  VALIDATION_EMPTY_CLI_OPERAND,
  validationCliDefinition,
  validationKnownOperands,
  validationOptionPrefix,
} from "@/interfaces/cli/validation-contract";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { TSCONFIG_FILES } from "@/validation/config/scope";
import type { ValidationStageParticipationOverride } from "@/validation/languages/types";
import { VALIDATION_PIPELINE_TOTAL_STEPS, validationPipelineStages } from "@/validation/registry";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
const CONTROL_ARGUMENT_PARTS = ["bad", "\x01", "arg", "\x1f", "end"] as const;
const UNICODE_ARGUMENT_PARTS = ["unicode", "é", "ø", "日", "語"] as const;
const LITERAL_PROBLEM_KINDS = Object.values(LITERAL_PROBLEM_KIND);
const ESCAPING_PATH_OPERAND = "../outside.ts";
const PACKAGED_CLI_DIRECTORY = "bin";
const PACKAGED_CLI_FILENAME = "spx.js";
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
const TYPESCRIPT_VALIDATION_NODE_SEGMENTS = [
  "spx",
  "41-validation.enabler",
  "32-typescript-validation.enabler",
] as const;
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

function validationStageOverride(stageName: string): ValidationStageParticipationOverride {
  const override = validationPipelineStages.find((stage) => stage.name === stageName)?.participation.override;
  if (override === undefined) {
    throw new Error(`Validation stage ${stageName} does not declare a full-pipeline override`);
  }
  return override;
}

export interface ValidationSubprocessScenario {
  readonly title: string;
  readonly kind: ValidationSubprocessScenarioKind;
  readonly args: readonly string[];
  readonly expectedExitCode?: number;
  readonly unexpectedExitCode?: number;
  readonly stdoutIncludes: readonly string[];
  readonly combinedIncludes: readonly string[];
  readonly stdoutExcludes: readonly string[];
  readonly stderrExcludes: readonly string[];
  readonly combinedExcludes: readonly string[];
}

export interface ValidationStructuralMappingScenario {
  readonly title: string;
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
  STABLE_VERDICT: "stableVerdict",
  ADDITIVE_VERDICTS: "additiveVerdicts",
} as const;

export type ValidationPipelineScenarioKind =
  (typeof VALIDATION_PIPELINE_SCENARIO_KIND)[keyof typeof VALIDATION_PIPELINE_SCENARIO_KIND];

export interface ValidationPipelineScenario {
  readonly title: string;
  readonly kind: ValidationPipelineScenarioKind;
}

export const VALIDATION_SUBPROCESS_SCENARIO_KIND = {
  LINT_CLEAN_PROJECT: "lintCleanProject",
  LINT_PYTHON_PROJECT: "lintPythonProject",
  LINT_BARE_PROJECT: "lintBareProject",
  LINT_MISSING_CONFIG: "lintMissingConfig",
  ALL_CLEAN_PROJECT: "allCleanProject",
  ALL_PYTHON_PROJECT: "allPythonProject",
} as const;

export type ValidationSubprocessScenarioKind =
  (typeof VALIDATION_SUBPROCESS_SCENARIO_KIND)[keyof typeof VALIDATION_SUBPROCESS_SCENARIO_KIND];

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
  circularOutput: {
    ...CIRCULAR_DEPENDENCY_OUTPUT,
    DETAIL_A_TO_B: CIRCULAR_DEPENDENCY_DETAIL_A_TO_B,
    DETAIL_B_TO_A: CIRCULAR_DEPENDENCY_DETAIL_B_TO_A,
  },
  circularSkipOutput: `${VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR}: skipped (${CIRCULAR_OVERRIDE.flag})`,
  circularSkipJsonOutput: formatValidationStageSkipJsonOutput(CIRCULAR_OVERRIDE.reason, 0),
  skipCircularFlag: CIRCULAR_OVERRIDE.flag,
  literalSkipOutput: `${VALIDATION_STAGE_DISPLAY_NAMES.LITERAL}: skipped (${LITERAL_OVERRIDE.flag})`,
  literalSkipJsonOutput: formatValidationStageSkipJsonOutput(LITERAL_OVERRIDE.reason, 0),
  skipLiteralFlag: LITERAL_OVERRIDE.flag,
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
  typescriptValidationNodeSegments: TYPESCRIPT_VALIDATION_NODE_SEGMENTS,
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
  return arbitraryDomainLiteral()
    .filter((candidate) => !validationKnownOperands.has(candidate))
    .filter((candidate) => !candidate.startsWith(validationOptionPrefix));
}

export function arbitraryValidationCliUnknownOption(): fc.Arbitrary<string> {
  return arbitraryDomainLiteral()
    .filter((candidate) => !validationKnownOperands.has(candidate))
    .map((candidate) => `${validationOptionPrefix}${candidate}`);
}

export function arbitraryValidationCliControlArgument(): fc.Arbitrary<string> {
  return fc.shuffledSubarray([...CONTROL_ARGUMENT_PARTS], {
    minLength: CONTROL_ARGUMENT_PARTS.length,
    maxLength: CONTROL_ARGUMENT_PARTS.length,
  }).map((parts) => parts.join(VALIDATION_EMPTY_CLI_OPERAND));
}

export function arbitraryValidationCliUnicodeArgument(): fc.Arbitrary<string> {
  return fc.shuffledSubarray([...UNICODE_ARGUMENT_PARTS], {
    minLength: UNICODE_ARGUMENT_PARTS.length,
    maxLength: UNICODE_ARGUMENT_PARTS.length,
  }).map((parts) => parts.join(VALIDATION_EMPTY_CLI_OPERAND))
    .filter((candidate) => !validationKnownOperands.has(candidate));
}

export function arbitraryInvalidLiteralProblemKind(): fc.Arbitrary<string> {
  return arbitraryDomainLiteral()
    .filter((candidate) => !LITERAL_PROBLEM_KINDS.includes(candidate as LiteralProblemKindCandidate));
}

export function arbitrarySanitizationSensitiveInvalidLiteralProblemKind(): fc.Arbitrary<string> {
  return arbitraryValidationCliControlArgument();
}

export function validationCliSuccessExitCodeUpperBound(): number {
  return validationCliDefinition.diagnostics.unknownSubcommand.exitCode;
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
      kind: VALIDATION_SUBPROCESS_SCENARIO_KIND.LINT_CLEAN_PROJECT,
      args,
      expectedExitCode: VALIDATION_EXIT_CODES.SUCCESS,
      stdoutIncludes: [VALIDATION_STAGE_DISPLAY_NAMES.ESLINT],
      combinedIncludes: [],
      stdoutExcludes: [lintSkip, ...runtimeAntiMarkers],
      stderrExcludes: runtimeAntiMarkers,
      combinedExcludes: runtimeAntiMarkers,
    },
    {
      title: "Python fixture skips ESLint",
      kind: VALIDATION_SUBPROCESS_SCENARIO_KIND.LINT_PYTHON_PROJECT,
      args,
      expectedExitCode: VALIDATION_EXIT_CODES.SUCCESS,
      stdoutIncludes: [lintSkip],
      combinedIncludes: [],
      stdoutExcludes: runtimeAntiMarkers,
      stderrExcludes: runtimeAntiMarkers,
      combinedExcludes: runtimeAntiMarkers,
    },
    {
      title: "bare fixture skips ESLint",
      kind: VALIDATION_SUBPROCESS_SCENARIO_KIND.LINT_BARE_PROJECT,
      args,
      expectedExitCode: VALIDATION_EXIT_CODES.SUCCESS,
      stdoutIncludes: [lintSkip],
      combinedIncludes: [],
      stdoutExcludes: runtimeAntiMarkers,
      stderrExcludes: runtimeAntiMarkers,
      combinedExcludes: runtimeAntiMarkers,
    },
    {
      title: "TypeScript fixture without ESLint config reports the missing config",
      kind: VALIDATION_SUBPROCESS_SCENARIO_KIND.LINT_MISSING_CONFIG,
      args,
      unexpectedExitCode: VALIDATION_EXIT_CODES.SUCCESS,
      stdoutIncludes: [],
      combinedIncludes: [VALIDATION_COMMAND_OUTPUT.ESLINT_MISSING_CONFIG],
      stdoutExcludes: runtimeAntiMarkers,
      stderrExcludes: runtimeAntiMarkers,
      combinedExcludes: runtimeAntiMarkers,
    },
  ];
}

export function validationAllTypeScriptSubprocessScenarios(): ValidationSubprocessScenario[] {
  const args = [validationCliDefinition.subcommands.all.commandName];
  const runtimeAntiMarkers = Object.values(VALIDATION_RUNTIME_ANTI_MARKERS);

  return [
    {
      title: "clean TypeScript fixture runs every validation stage",
      kind: VALIDATION_SUBPROCESS_SCENARIO_KIND.ALL_CLEAN_PROJECT,
      args,
      expectedExitCode: VALIDATION_EXIT_CODES.SUCCESS,
      stdoutIncludes: [
        VALIDATION_COMMAND_OUTPUT.ESLINT_SUCCESS,
        VALIDATION_COMMAND_OUTPUT.KNIP_DISABLED,
        VALIDATION_COMMAND_OUTPUT.TYPESCRIPT_SUCCESS,
        VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND,
        NO_PROBLEMS_MESSAGE,
      ],
      combinedIncludes: [],
      stdoutExcludes: runtimeAntiMarkers,
      stderrExcludes: runtimeAntiMarkers,
      combinedExcludes: runtimeAntiMarkers,
    },
    {
      title: "Python fixture skips TypeScript validation stages",
      kind: VALIDATION_SUBPROCESS_SCENARIO_KIND.ALL_PYTHON_PROJECT,
      args,
      expectedExitCode: VALIDATION_EXIT_CODES.SUCCESS,
      stdoutIncludes: [
        formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.ESLINT),
        formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.KNIP),
        formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT),
        formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR),
        formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.LITERAL),
      ],
      combinedIncludes: [],
      stdoutExcludes: runtimeAntiMarkers,
      stderrExcludes: runtimeAntiMarkers,
      combinedExcludes: runtimeAntiMarkers,
    },
  ];
}

export function validationStructuralMappingScenarios(): ValidationStructuralMappingScenario[] {
  return [
    {
      title: "TypeScript registry composition reaches every required executable concern",
    },
  ];
}

export function validationPipelineScenarios(): ValidationPipelineScenario[] {
  return [
    {
      title: "clean project passes the full validation pipeline",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.CLEAN_PROJECT,
    },
    {
      title: "pipeline failure output identifies the failed step",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.FAILURE_IDENTIFIES_STEP,
    },
    {
      title: "production scope runs every step in sequence",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.PRODUCTION_SCOPE,
    },
    {
      title: "path directory scope runs every step in sequence",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.PATH_DIRECTORY_SCOPE,
    },
    {
      title: "path file scope runs every step in sequence",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.PATH_FILE_SCOPE,
    },
    {
      title: "step completion lines stay in pipeline order",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.STEP_ORDER,
    },
    {
      title: "skip circular suppresses circular detection and respects quiet and json output",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.SKIP_CIRCULAR,
    },
    {
      title: "skip literal suppresses literal detection and respects quiet and json output",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.SKIP_LITERAL,
    },
    {
      title: "later steps still run after the first step fails",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.NO_SHORT_CIRCUIT,
    },
    {
      title: "any step failure makes the pipeline exit non-zero",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.FAILURE_EXIT_CODE,
    },
    {
      title: "every step line carries a duration annotation",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.STEP_DURATION,
    },
    {
      title: "repeated clean runs produce the same verdicts",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.STABLE_VERDICT,
    },
    {
      title: "fixing TypeScript errors leaves other step verdicts unchanged",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.ADDITIVE_VERDICTS,
    },
  ];
}

export const VALIDATION_CLI_GENERATOR = {
  unknownSubcommand: arbitraryValidationCliUnknownSubcommand,
  unknownOption: arbitraryValidationCliUnknownOption,
  controlArgument: arbitraryValidationCliControlArgument,
  unicodeArgument: arbitraryValidationCliUnicodeArgument,
  invalidLiteralProblemKind: arbitraryInvalidLiteralProblemKind,
  sanitizationSensitiveInvalidLiteralProblemKind: arbitrarySanitizationSensitiveInvalidLiteralProblemKind,
} as const;

type LiteralProblemKindCandidate = (typeof LITERAL_PROBLEM_KINDS)[number];
