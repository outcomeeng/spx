import type { Command } from "commander";
import * as fc from "fast-check";
import { resolve } from "node:path";

import { LITERAL_PROBLEM_KIND } from "@/commands/validation";
import { CIRCULAR_DEPENDENCY_OUTPUT } from "@/commands/validation/circular";
import { VALIDATION_SUMMARY_STATUS } from "@/commands/validation/format";
import {
  formatTypeScriptAbsentSkipMessage,
  LITERAL_SKIP_JSON_OUTPUT,
  LITERAL_SKIP_OUTPUT,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_EXIT_CODES,
  VALIDATION_PIPELINE,
  VALIDATION_STAGE_DISPLAY_NAMES,
  VALIDATION_STEP_DURATION_PATTERN,
  VALIDATION_STEP_LINE_PATTERN,
} from "@/commands/validation/messages";
import { VALIDATION_RUNTIME_ANTI_MARKERS } from "@/commands/validation/runtime-diagnostics";
import {
  allValidationCliOptions,
  validationCliDefinition,
  validationKnownOperands,
  validationOptionPrefix,
} from "@/domains/validation";
import { TSCONFIG_FILES } from "@/validation/config/scope";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
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
const COMMANDER_NODE_EXECUTABLE = "node";
const COMMANDER_SCRIPT_NAME = "spx";
const OPTION_OPERAND_SEPARATOR = " ";
const PROCESS_EXIT_UNAVAILABLE = -1;
const PACKAGED_CLI_DIRECTORY = "bin";
const PACKAGED_CLI_FILENAME = "spx.js";
const PIPELINE_SUBPROCESS_TIMEOUT_MS = 120_000;
const VALIDATION_ENABLER_SUFFIX = ".enabler";
const VALIDATION_INDEX_SLUG_PATTERN = /^\d+-(.+)\.enabler$/;
const TYPESCRIPT_VALIDATION_NODE = "32-typescript-validation.enabler";
const PYTHON_VALIDATION_NODE = "32-python-validation.enabler";
const LITERAL_SKIP_SOURCE_SEGMENTS = ["src", "literal-skip.ts"] as const;
const LITERAL_SKIP_TEST_SEGMENTS = [
  "spx",
  "21-literal-skip.enabler",
  "tests",
  "literal-skip.scenario.l1.test.ts",
] as const;
const LITERAL_SKIP_TOKEN = "validation-all-skip-literal-token";
const TYPE_ERROR_SOURCE_SEGMENTS = ["src", "has-type-error.ts"] as const;
const TYPE_ERROR_REPLACEMENT_PATTERN = /const x:\s*number\s*=\s*"[^"]+";?/g;
const TYPE_ERROR_REPLACEMENT = "const x: number = 0;";
const OUTPUT_LINE_SEPARATOR = "\n";
const VALIDATION_STEP_OUTCOME_PASS = "pass";
const VALIDATION_STEP_OUTCOME_SKIP = "skip";
const VALIDATION_STEP_OUTCOME_FAIL = "fail";

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

export const VALIDATION_STRUCTURAL_MAPPING_KIND = {
  TYPESCRIPT: "typescript",
  PYTHON: "python",
} as const;

export type ValidationStructuralMappingKind =
  (typeof VALIDATION_STRUCTURAL_MAPPING_KIND)[keyof typeof VALIDATION_STRUCTURAL_MAPPING_KIND];

export interface ValidationStructuralMappingScenario {
  readonly title: string;
  readonly kind: ValidationStructuralMappingKind;
  readonly nodeDirectory: string;
  readonly expectedChildren: ReadonlySet<string>;
}

export const VALIDATION_PIPELINE_SCENARIO_KIND = {
  CLEAN_PROJECT: "cleanProject",
  FAILURE_IDENTIFIES_STEP: "failureIdentifiesStep",
  PRODUCTION_SCOPE: "productionScope",
  FILE_SCOPE: "fileScope",
  STEP_ORDER: "stepOrder",
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
  readonly timeout: number;
}

export const VALIDATION_PIPELINE_DATA = {
  enablerSuffix: VALIDATION_ENABLER_SUFFIX,
  indexSlugPattern: VALIDATION_INDEX_SLUG_PATTERN,
  typeScriptNodeDirectory: TYPESCRIPT_VALIDATION_NODE,
  pythonNodeDirectory: PYTHON_VALIDATION_NODE,
  typeScriptExpectedChildren: new Set([
    "lint",
    "type-check",
    "ast-enforcement",
    "circular-deps",
    "literal-reuse",
  ]),
  pythonExpectedChildren: new Set(["lint", "type-check", "ast-enforcement"]),
  allTimeout: PIPELINE_SUBPROCESS_TIMEOUT_MS,
  repeatedRunTimeout: PIPELINE_SUBPROCESS_TIMEOUT_MS * 2,
  totalSteps: VALIDATION_PIPELINE.TOTAL_STEPS,
  stepLinePattern: VALIDATION_STEP_LINE_PATTERN,
  stepDurationPattern: VALIDATION_STEP_DURATION_PATTERN,
  expectedStepNumbers: [1, 2, 3, 4, 5, 6],
  stepsIndependentOfTypeScript: [1, 2, 3, 5, 6],
  outputLineSeparator: OUTPUT_LINE_SEPARATOR,
  stageNames: VALIDATION_STAGE_DISPLAY_NAMES,
  exitCodes: VALIDATION_EXIT_CODES,
  summaryStatus: VALIDATION_SUMMARY_STATUS,
  circularOutput: CIRCULAR_DEPENDENCY_OUTPUT,
  literalSkipOutput: LITERAL_SKIP_OUTPUT,
  literalSkipJsonOutput: LITERAL_SKIP_JSON_OUTPUT,
  skipLiteralFlag: allValidationCliOptions.skipLiteral.flag,
  quietFlag: "--quiet",
  jsonFlag: "--json",
  scopeFlag: "--scope",
  filesFlag: "--files",
  productionScope: "production",
  sourceDirectoryName: "src",
  cleanSourceFileName: "clean.ts",
  literalSkipSourceSegments: LITERAL_SKIP_SOURCE_SEGMENTS,
  literalSkipTestSegments: LITERAL_SKIP_TEST_SEGMENTS,
  literalSkipToken: LITERAL_SKIP_TOKEN,
  productionTsconfigFile: TSCONFIG_FILES.production,
  productionTsconfigContent: JSON.stringify({
    extends: `./${TSCONFIG_FILES.full}`,
    include: ["src/**/*"],
  }),
  typeErrorSourceSegments: TYPE_ERROR_SOURCE_SEGMENTS,
  typeErrorReplacementPattern: TYPE_ERROR_REPLACEMENT_PATTERN,
  typeErrorReplacement: TYPE_ERROR_REPLACEMENT,
  outcome: {
    pass: VALIDATION_STEP_OUTCOME_PASS,
    skip: VALIDATION_STEP_OUTCOME_SKIP,
    fail: VALIDATION_STEP_OUTCOME_FAIL,
  },
} as const;

export type ValidationStepOutcome =
  (typeof VALIDATION_PIPELINE_DATA.outcome)[keyof typeof VALIDATION_PIPELINE_DATA.outcome];

export type ValidationCliCommanderParseSource = NonNullable<
  NonNullable<Parameters<Command["parseAsync"]>[1]>["from"]
>;

export function arbitraryValidationCliUnknownSubcommand(): fc.Arbitrary<string> {
  return arbitraryDomainLiteral()
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
  return arbitraryDomainLiteral()
    .filter((candidate) => !LITERAL_PROBLEM_KINDS.includes(candidate as LiteralProblemKindCandidate));
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

export function validationCliSuccessExitCodeUpperBound(): number {
  return validationCliDefinition.diagnostics.unknownSubcommand.exitCode;
}

export function validationCliEmptyOutputLength(): number {
  return EMPTY_CLI_ARGUMENT.length;
}

export function validationCliTempDirectoryPrefix(): string {
  return VALIDATION_CLI_TEMP_PREFIX;
}

export function validationCliCommanderArgvPrefix(): string[] {
  return [
    COMMANDER_NODE_EXECUTABLE,
    COMMANDER_SCRIPT_NAME,
    validationCliDefinition.domain.commandName,
  ];
}

export function validationCliCommanderParseSource(): ValidationCliCommanderParseSource {
  return COMMANDER_NODE_EXECUTABLE;
}

export function validationCliOptionOperandSeparator(): string {
  return OPTION_OPERAND_SEPARATOR;
}

export function validationCliUnavailableExitCode(): number {
  return PROCESS_EXIT_UNAVAILABLE;
}

export function validationCliPackagedExecutablePath(): string {
  return resolve(process.cwd(), PACKAGED_CLI_DIRECTORY, PACKAGED_CLI_FILENAME);
}

export function validationCircularSubprocessScenarios(): ValidationSubprocessScenario[] {
  const args = [validationCliDefinition.subcommands.circular.commandName];
  const runtimeAntiMarkers = Object.values(VALIDATION_RUNTIME_ANTI_MARKERS);
  const circularSkip = formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR);

  return [
    {
      title: "clean TypeScript fixture reports no circular dependencies",
      fixture: PROJECT_FIXTURES.CLEAN_PROJECT,
      args,
      timeout: HARNESS_TIMEOUT,
      expectedExitCode: VALIDATION_EXIT_CODES.SUCCESS,
      stdoutIncludes: [VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND],
      combinedIncludes: [],
      stdoutExcludes: [circularSkip, ...runtimeAntiMarkers],
      stderrExcludes: runtimeAntiMarkers,
      combinedExcludes: runtimeAntiMarkers,
    },
    {
      title: "circular TypeScript fixture reports the cycle",
      fixture: PROJECT_FIXTURES.WITH_CIRCULAR_DEPS,
      args,
      timeout: HARNESS_TIMEOUT,
      unexpectedExitCode: VALIDATION_EXIT_CODES.SUCCESS,
      stdoutIncludes: [VALIDATION_COMMAND_OUTPUT.CIRCULAR_FOUND],
      combinedIncludes: [],
      stdoutExcludes: runtimeAntiMarkers,
      stderrExcludes: runtimeAntiMarkers,
      combinedExcludes: runtimeAntiMarkers,
    },
    {
      title: "bare fixture skips circular dependency detection",
      fixture: PROJECT_FIXTURES.BARE_PROJECT,
      args,
      timeout: HARNESS_TIMEOUT,
      expectedExitCode: VALIDATION_EXIT_CODES.SUCCESS,
      stdoutIncludes: [circularSkip],
      combinedIncludes: [],
      stdoutExcludes: runtimeAntiMarkers,
      stderrExcludes: runtimeAntiMarkers,
      combinedExcludes: runtimeAntiMarkers,
    },
    {
      title: "Python fixture skips circular dependency detection",
      fixture: PROJECT_FIXTURES.PYTHON_PROJECT,
      args,
      timeout: HARNESS_TIMEOUT,
      expectedExitCode: VALIDATION_EXIT_CODES.SUCCESS,
      stdoutIncludes: [circularSkip],
      combinedIncludes: [],
      stdoutExcludes: runtimeAntiMarkers,
      stderrExcludes: runtimeAntiMarkers,
      combinedExcludes: runtimeAntiMarkers,
    },
    {
      title: "TypeScript files without tsconfig skip circular dependency detection",
      fixture: PROJECT_FIXTURES.TYPESCRIPT_NO_TSCONFIG,
      args,
      timeout: HARNESS_TIMEOUT,
      expectedExitCode: VALIDATION_EXIT_CODES.SUCCESS,
      stdoutIncludes: [circularSkip],
      combinedIncludes: [],
      stdoutExcludes: runtimeAntiMarkers,
      stderrExcludes: runtimeAntiMarkers,
      combinedExcludes: runtimeAntiMarkers,
    },
  ];
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

export function validationAllTypeScriptSubprocessScenarios(): ValidationSubprocessScenario[] {
  const args = [validationCliDefinition.subcommands.all.commandName];
  const runtimeAntiMarkers = Object.values(VALIDATION_RUNTIME_ANTI_MARKERS);

  return [
    {
      title: "clean TypeScript fixture runs every validation stage",
      fixture: PROJECT_FIXTURES.CLEAN_PROJECT,
      args,
      timeout: PIPELINE_SUBPROCESS_TIMEOUT_MS,
      expectedExitCode: VALIDATION_EXIT_CODES.SUCCESS,
      stdoutIncludes: [
        VALIDATION_STAGE_DISPLAY_NAMES.ESLINT,
        VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT,
        VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR,
        VALIDATION_STAGE_DISPLAY_NAMES.LITERAL,
      ],
      combinedIncludes: [],
      stdoutExcludes: runtimeAntiMarkers,
      stderrExcludes: runtimeAntiMarkers,
      combinedExcludes: runtimeAntiMarkers,
    },
    {
      title: "Python fixture skips TypeScript validation stages",
      fixture: PROJECT_FIXTURES.PYTHON_PROJECT,
      args,
      timeout: HARNESS_TIMEOUT,
      expectedExitCode: VALIDATION_EXIT_CODES.SUCCESS,
      stdoutIncludes: [
        formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.ESLINT),
        formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT),
        formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR),
        VALIDATION_STAGE_DISPLAY_NAMES.LITERAL,
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
      title: "TypeScript validation node has the declared leaf enabler children",
      kind: VALIDATION_STRUCTURAL_MAPPING_KIND.TYPESCRIPT,
      nodeDirectory: VALIDATION_PIPELINE_DATA.typeScriptNodeDirectory,
      expectedChildren: VALIDATION_PIPELINE_DATA.typeScriptExpectedChildren,
    },
    {
      title: "Python validation node has the declared leaf enabler children",
      kind: VALIDATION_STRUCTURAL_MAPPING_KIND.PYTHON,
      nodeDirectory: VALIDATION_PIPELINE_DATA.pythonNodeDirectory,
      expectedChildren: VALIDATION_PIPELINE_DATA.pythonExpectedChildren,
    },
  ];
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
      title: "file scope runs every step in sequence",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.FILE_SCOPE,
      timeout: VALIDATION_PIPELINE_DATA.allTimeout,
    },
    {
      title: "step completion lines stay in pipeline order",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.STEP_ORDER,
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
    {
      title: "repeated clean runs produce the same verdicts",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.STABLE_VERDICT,
      timeout: VALIDATION_PIPELINE_DATA.repeatedRunTimeout,
    },
    {
      title: "fixing TypeScript errors leaves other step verdicts unchanged",
      kind: VALIDATION_PIPELINE_SCENARIO_KIND.ADDITIVE_VERDICTS,
      timeout: VALIDATION_PIPELINE_DATA.repeatedRunTimeout,
    },
  ];
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
