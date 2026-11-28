import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

import { ALL_VALIDATION_JSON_FIELD, type AllValidationJsonOutput } from "@/commands/validation/types";
import { validationAllOverrideCliOptions, validationOptionPropertyName } from "@/interfaces/cli/validation";
import {
  validationAllBuiltInCliOptions,
  validationCliDefinition,
  validationCommonCliOptions,
} from "@/interfaces/cli/validation-contract";
import { VALIDATION_STAGE_PARTICIPATION, type ValidationStage } from "@/validation/languages/types";
import { validationPipelineStages } from "@/validation/registry";
import {
  VALIDATION_PIPELINE_DATA,
  VALIDATION_PIPELINE_SCENARIO_KIND,
  type ValidationPipelineScenario,
  validationPipelineScenarios,
  type ValidationStepOutcome,
} from "@testing/generators/validation/validation";
import {
  runValidationSubprocess,
  VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
  VALIDATION_REPEATED_PIPELINE_TIMEOUT,
  validationCliEmptyOutput,
  type ValidationCliResult,
} from "@testing/harnesses/validation/cli";
import { collectHarnessTestCases, describe, it } from "@testing/harnesses/vitest-registration";
import { PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const VALIDATION_ROOT = resolve(
  __dirname,
  "../../../spx/41-validation.enabler",
);
const OVERRIDE_METADATA_TEST_STAGE_NAME = "Override metadata test";
const OVERRIDE_METADATA_TEST_FLAG = "--override-metadata-test";
const OVERRIDE_METADATA_TEST_DESCRIPTION = "Override metadata test flag";
const OVERRIDE_METADATA_TEST_REASON = "override-metadata-test";
const UNSUPPORTED_OVERRIDE_METADATA_FLAGS = [
  "--no-override-metadata-test",
  "--override-metadata-test <value>",
  "--override-metadata-test, -o",
  "--overrideMetadataTest",
] as const;
const COLLIDING_OVERRIDE_METADATA_TEST_FLAG = "--overrideMetadata-test";

export interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

export function deferred(): Deferred {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolvePromiseArgument) => {
    resolvePromise = resolvePromiseArgument;
  });
  if (resolvePromise === undefined) {
    throw new Error("deferred resolver was not initialized");
  }
  return { promise, resolve: resolvePromise };
}

export async function runValidationPipelineScenario(
  scenario: ValidationPipelineScenario,
): Promise<void> {
  switch (scenario.kind) {
    case VALIDATION_PIPELINE_SCENARIO_KIND.SKIP_CIRCULAR:
      return runSkipCircularScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.SKIP_LITERAL:
      return runSkipLiteralScenario(scenario);
    default:
      throw new Error(`${scenario.kind} is asserted by its linked test file`);
  }
}

const VALIDATION_SKIP_KINDS = new Set([
  VALIDATION_PIPELINE_SCENARIO_KIND.SKIP_CIRCULAR,
  VALIDATION_PIPELINE_SCENARIO_KIND.SKIP_LITERAL,
]);

function registerValidationPipelineTests(
  title: string,
  kinds: ReadonlySet<ValidationPipelineScenario["kind"]>,
): void {
  describe(title, () => {
    for (const scenario of validationPipelineScenarios().filter((candidate) => kinds.has(candidate.kind))) {
      it(
        scenario.title,
        async () => {
          await runValidationPipelineScenario(scenario);
        },
        VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
      );
    }
  });
}

export const validationPipelineSkipScenarioCases = collectHarnessTestCases(
  () => {
    registerValidationPipelineTests(
      "validation full-pipeline skip scenarios",
      VALIDATION_SKIP_KINDS,
    );
  },
);

export function expectValidationAllOverrideOptionsDerived(): void {
  const descriptorOwnedOptions = validationPipelineStages.map((stage) => {
    const override = stage.participation.override;
    return {
      stageName: stage.name,
      flag: override.flag,
      description: override.description,
      reason: stage.participation.skipReason,
      optionPropertyName: validationOptionPropertyName(override.flag),
    };
  });
  expect(validationAllOverrideCliOptions).toEqual(descriptorOwnedOptions);
}

export function invalidOverrideMetadataStageSets(): readonly (readonly ValidationStage[])[] {
  const reservedFlags = [
    validationAllBuiltInCliOptions.fix.flag,
    validationCommonCliOptions.scope.flag,
    validationCommonCliOptions.quiet.flag,
    validationCommonCliOptions.json.flag,
    validationCliDefinition.commanderHelpOperands.longFlag,
  ];
  const validStage = validationOverrideMetadataTestStage(OVERRIDE_METADATA_TEST_FLAG);
  return [
    ...UNSUPPORTED_OVERRIDE_METADATA_FLAGS.map((flag) => [validationOverrideMetadataTestStage(flag)]),
    [validStage, validationOverrideMetadataTestStage(COLLIDING_OVERRIDE_METADATA_TEST_FLAG)],
    ...reservedFlags.map((flag) => [validationOverrideMetadataTestStage(flag)]),
    [{ ...validStage, participation: { ...validStage.participation, skipReason: "" } }],
  ];
}

function validationOverrideMetadataTestStage(flag: string): ValidationStage {
  return {
    name: OVERRIDE_METADATA_TEST_STAGE_NAME,
    failsPipeline: true,
    participation: {
      default: VALIDATION_STAGE_PARTICIPATION.RUN,
      override: {
        flag: flag as `--${string}`,
        description: OVERRIDE_METADATA_TEST_DESCRIPTION,
      },
      skipReason: OVERRIDE_METADATA_TEST_REASON,
    },
    run: () => Promise.resolve({ exitCode: VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS, output: "" }),
  };
}
export const validationPipelineSkipComplianceCases = collectHarnessTestCases(
  () => {
    registerValidationPipelineTests(
      "validation full-pipeline skip compliance",
      VALIDATION_SKIP_KINDS,
    );
  },
);
export const validationPipelineJsonComplianceCases = collectHarnessTestCases(
  () => {
    describe("validation aggregate JSON compliance", () => {
      it(
        "emits one complete JSON document with and without quiet mode",
        runJsonDocumentComplianceScenario,
        VALIDATION_REPEATED_PIPELINE_TIMEOUT,
      );
    });
  },
);

export async function runValidationAll(
  cwd: string,
  args: readonly string[] = [],
): Promise<{
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  return runValidationSubprocess(
    [validationCliDefinition.subcommands.all.commandName, ...args],
    {
      cwd,
      timeout: VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
    },
  );
}

function parseAllValidationJson(result: ValidationCliResult): AllValidationJsonOutput {
  expect(result.stderr).toBe(validationCliEmptyOutput());
  const parsed: unknown = JSON.parse(result.stdout);
  expect(parsed).toEqual(expect.objectContaining({
    [ALL_VALIDATION_JSON_FIELD.SUCCESS]: expect.any(Boolean),
    [ALL_VALIDATION_JSON_FIELD.DURATION_MS]: expect.any(Number),
    [ALL_VALIDATION_JSON_FIELD.STEPS]: expect.any(Array),
  }));
  const jsonOutput = parsed as AllValidationJsonOutput;
  expect(jsonOutput.steps).toHaveLength(validationPipelineStages.length);
  expect(jsonOutput.steps.map((step) => step.name)).toEqual(validationPipelineStages.map((stage) => stage.name));
  for (const step of jsonOutput.steps) {
    expect(step).toEqual(expect.objectContaining({
      [ALL_VALIDATION_JSON_FIELD.NAME]: expect.any(String),
      [ALL_VALIDATION_JSON_FIELD.EXIT_CODE]: expect.any(Number),
      [ALL_VALIDATION_JSON_FIELD.STDOUT]: expect.any(String),
      [ALL_VALIDATION_JSON_FIELD.STDERR]: expect.any(String),
    }));
    expect(Object.hasOwn(step, ALL_VALIDATION_JSON_FIELD.OUTPUT)).toBe(true);
  }
  return jsonOutput;
}

function expectSkippedJsonStage(
  result: ValidationCliResult,
  stageName: string,
  skipOutput: string,
): void {
  const step = parseAllValidationJson(result).steps.find((candidate) => candidate.name === stageName);
  const expectedOutput = JSON.parse(skipOutput) as Record<string, unknown>;
  expectedOutput[ALL_VALIDATION_JSON_FIELD.DURATION_MS] = step?.durationMs;
  expect(step).toEqual(expect.objectContaining({
    [ALL_VALIDATION_JSON_FIELD.NAME]: stageName,
    [ALL_VALIDATION_JSON_FIELD.EXIT_CODE]: VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
    [ALL_VALIDATION_JSON_FIELD.OUTPUT]: expectedOutput,
  }));
}

async function runJsonDocumentComplianceScenario(): Promise<void> {
  await withValidationEnv(
    { fixture: PROJECT_FIXTURES.CLEAN_PROJECT },
    async ({ path }) => {
      const jsonResult = await runValidationAll(path, [VALIDATION_PIPELINE_DATA.jsonFlag]);
      expect(jsonResult.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
      expect(parseAllValidationJson(jsonResult).success).toBe(true);

      const quietJsonResult = await runValidationAll(path, [
        VALIDATION_PIPELINE_DATA.quietFlag,
        VALIDATION_PIPELINE_DATA.jsonFlag,
      ]);
      expect(quietJsonResult.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
      expect(parseAllValidationJson(quietJsonResult).success).toBe(true);
    },
  );
}

async function runSkipCircularScenario(
  _scenario: ValidationPipelineScenario,
): Promise<void> {
  await withValidationEnv(
    { fixture: PROJECT_FIXTURES.CLEAN_PROJECT },
    async ({ path }) => {
      await writeCircularSkipFixture(path);

      const result = await runValidationAll(path, [
        VALIDATION_PIPELINE_DATA.skipCircularFlag,
      ]);

      expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
      expectStepSequence(result.stdout);
      expect(result.stdout).toContain(
        VALIDATION_PIPELINE_DATA.stageNames.CIRCULAR,
      );
      expect(result.stdout).toContain(
        VALIDATION_PIPELINE_DATA.stageNames.ESLINT,
      );
      expect(result.stdout).toContain(
        VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT,
      );
      expect(result.stdout).toContain(
        VALIDATION_PIPELINE_DATA.stageNames.MARKDOWN,
      );
      expect(result.stdout).toContain(
        VALIDATION_PIPELINE_DATA.stageNames.LITERAL,
      );
      expect(result.stdout).toContain(
        VALIDATION_PIPELINE_DATA.circularSkipOutput,
      );
      expect(result.stdout).not.toContain(
        VALIDATION_PIPELINE_DATA.circularOutput.FOUND,
      );

      const quietResult = await runValidationAll(path, [
        VALIDATION_PIPELINE_DATA.skipCircularFlag,
        VALIDATION_PIPELINE_DATA.quietFlag,
      ]);

      expect(quietResult.exitCode).toBe(
        VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
      );
      expect(quietResult.stdout).not.toContain(
        VALIDATION_PIPELINE_DATA.circularSkipOutput,
      );
      expect(quietResult.stdout.trim()).toHaveLength(0);

      const jsonResult = await runValidationAll(path, [
        VALIDATION_PIPELINE_DATA.skipCircularFlag,
        VALIDATION_PIPELINE_DATA.jsonFlag,
      ]);

      expect(jsonResult.exitCode).toBe(
        VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
      );
      expectSkippedJsonStage(
        jsonResult,
        VALIDATION_PIPELINE_DATA.stageNames.CIRCULAR,
        VALIDATION_PIPELINE_DATA.circularSkipJsonOutput,
      );
      expect(jsonResult.stdout).not.toContain(
        VALIDATION_PIPELINE_DATA.circularSkipOutput,
      );

      const quietJsonResult = await runValidationAll(path, [
        VALIDATION_PIPELINE_DATA.skipCircularFlag,
        VALIDATION_PIPELINE_DATA.quietFlag,
        VALIDATION_PIPELINE_DATA.jsonFlag,
      ]);

      expect(quietJsonResult.exitCode).toBe(
        VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
      );
      expectSkippedJsonStage(
        quietJsonResult,
        VALIDATION_PIPELINE_DATA.stageNames.CIRCULAR,
        VALIDATION_PIPELINE_DATA.circularSkipJsonOutput,
      );

      const productionResult = await runValidationAll(path, [
        VALIDATION_PIPELINE_DATA.scopeFlag,
        VALIDATION_PIPELINE_DATA.productionScope,
        VALIDATION_PIPELINE_DATA.skipCircularFlag,
      ]);

      expect(productionResult.exitCode).toBe(
        VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
      );
      expectStepSequence(productionResult.stdout);
      expect(productionResult.stdout).toContain(
        VALIDATION_PIPELINE_DATA.circularSkipOutput,
      );
    },
  );
}

async function writeCircularSkipFixture(path: string): Promise<void> {
  const srcDir = join(path, VALIDATION_PIPELINE_DATA.sourceDirectoryName);
  await mkdir(srcDir, { recursive: true });
  await writeFile(
    join(path, ...VALIDATION_PIPELINE_DATA.circularSkipASourceSegments),
    `import { circularSkipB } from "./circular-skip-b";\n\nexport function circularSkipA(): string {\n  return \`a-\${circularSkipB()}\`;\n}\n`,
    "utf8",
  );
  await writeFile(
    join(path, ...VALIDATION_PIPELINE_DATA.circularSkipBSourceSegments),
    `import { circularSkipA } from "./circular-skip-a";\n\nexport function circularSkipB(): string {\n  return \`b-\${circularSkipA()}\`;\n}\n`,
    "utf8",
  );
  await writeFile(
    join(path, VALIDATION_PIPELINE_DATA.productionTsconfigFile),
    `${VALIDATION_PIPELINE_DATA.productionTsconfigContent}\n`,
    "utf8",
  );
}

async function runSkipLiteralScenario(
  _scenario: ValidationPipelineScenario,
): Promise<void> {
  await withValidationEnv(
    { fixture: PROJECT_FIXTURES.CLEAN_PROJECT },
    async ({ path }) => {
      await writeLiteralSkipFixture(path);

      const result = await runValidationAll(path, [
        VALIDATION_PIPELINE_DATA.skipLiteralFlag,
      ]);

      expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
      expectStepSequence(result.stdout);
      expect(result.stdout).toContain(
        VALIDATION_PIPELINE_DATA.stageNames.CIRCULAR,
      );
      expect(result.stdout).toContain(
        VALIDATION_PIPELINE_DATA.stageNames.ESLINT,
      );
      expect(result.stdout).toContain(
        VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT,
      );
      expect(result.stdout).toContain(
        VALIDATION_PIPELINE_DATA.stageNames.MARKDOWN,
      );
      expect(result.stdout).toContain(
        VALIDATION_PIPELINE_DATA.stageNames.LITERAL,
      );
      expect(result.stdout).toContain(
        VALIDATION_PIPELINE_DATA.literalSkipOutput,
      );

      const quietResult = await runValidationAll(path, [
        VALIDATION_PIPELINE_DATA.skipLiteralFlag,
        VALIDATION_PIPELINE_DATA.quietFlag,
      ]);

      expect(quietResult.exitCode).toBe(
        VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
      );
      expect(quietResult.stdout).not.toContain(
        VALIDATION_PIPELINE_DATA.literalSkipOutput,
      );
      expect(quietResult.stdout.trim()).toHaveLength(0);

      const jsonResult = await runValidationAll(path, [
        VALIDATION_PIPELINE_DATA.skipLiteralFlag,
        VALIDATION_PIPELINE_DATA.jsonFlag,
      ]);

      expect(jsonResult.exitCode).toBe(
        VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
      );
      expectSkippedJsonStage(
        jsonResult,
        VALIDATION_PIPELINE_DATA.stageNames.LITERAL,
        VALIDATION_PIPELINE_DATA.literalSkipJsonOutput,
      );
      expect(jsonResult.stdout).not.toContain(
        VALIDATION_PIPELINE_DATA.literalSkipOutput,
      );

      const quietJsonResult = await runValidationAll(path, [
        VALIDATION_PIPELINE_DATA.skipLiteralFlag,
        VALIDATION_PIPELINE_DATA.quietFlag,
        VALIDATION_PIPELINE_DATA.jsonFlag,
      ]);

      expect(quietJsonResult.exitCode).toBe(
        VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
      );
      expectSkippedJsonStage(
        quietJsonResult,
        VALIDATION_PIPELINE_DATA.stageNames.LITERAL,
        VALIDATION_PIPELINE_DATA.literalSkipJsonOutput,
      );

      const productionResult = await runValidationAll(path, [
        VALIDATION_PIPELINE_DATA.scopeFlag,
        VALIDATION_PIPELINE_DATA.productionScope,
        VALIDATION_PIPELINE_DATA.skipLiteralFlag,
      ]);

      expect(productionResult.exitCode).toBe(
        VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
      );
      expectStepSequence(productionResult.stdout);
      expect(productionResult.stdout).toContain(
        VALIDATION_PIPELINE_DATA.literalSkipOutput,
      );
    },
  );
}

export function validationParticipationPolicy(stageName: string): ValidationStage["participation"] {
  const stage = validationPipelineStages.find((candidate) => candidate.name === stageName);
  if (stage === undefined) throw new Error(`validation registry has no ${stageName} stage`);
  return stage.participation;
}

async function writeLiteralSkipFixture(path: string): Promise<void> {
  const srcDir = join(path, VALIDATION_PIPELINE_DATA.sourceDirectoryName);
  const testDir = join(
    path,
    ...VALIDATION_PIPELINE_DATA.literalSkipTestSegments.slice(0, -1),
  );
  await mkdir(srcDir, { recursive: true });
  await mkdir(testDir, { recursive: true });
  await writeFile(
    join(path, ...VALIDATION_PIPELINE_DATA.literalSkipSourceSegments),
    `export const TOKEN = "${VALIDATION_PIPELINE_DATA.literalSkipToken}";\n`,
    "utf8",
  );
  await writeFile(
    join(path, ...VALIDATION_PIPELINE_DATA.literalSkipTestSegments),
    `expect(value).toBe("${VALIDATION_PIPELINE_DATA.literalSkipToken}");\n`,
    "utf8",
  );
  await writeFile(
    join(path, VALIDATION_PIPELINE_DATA.productionTsconfigFile),
    `${VALIDATION_PIPELINE_DATA.productionTsconfigContent}\n`,
    "utf8",
  );
}

function expectStepSequence(stdout: string): void {
  const stepMarkers = [
    ...stdout.matchAll(VALIDATION_PIPELINE_DATA.stepLinePattern),
  ];
  expect(stepMarkers).toHaveLength(VALIDATION_PIPELINE_DATA.totalSteps);
  expect(stepMarkers.map((match) => Number(match[1]))).toEqual(
    VALIDATION_PIPELINE_DATA.expectedStepNumbers,
  );
  // Every step line's denominator must equal the registry-derived step count,
  // so a wrong denominator surfaced in CLI output (e.g. [1/5] while six stages
  // run) fails rather than passing on step numbers alone.
  expect(stepMarkers.map((match) => Number(match[2]))).toEqual(
    VALIDATION_PIPELINE_DATA.expectedStepNumbers.map(
      () => VALIDATION_PIPELINE_DATA.totalSteps,
    ),
  );
}

export function extractStepOutcomes(
  stdout: string,
): Map<number, ValidationStepOutcome> {
  const outcomes = new Map<number, ValidationStepOutcome>();
  for (
    const line of stdout.split(
      VALIDATION_PIPELINE_DATA.outputLineSeparator,
    )
  ) {
    const match = [
      ...line.matchAll(VALIDATION_PIPELINE_DATA.stepLinePattern),
    ].at(0);
    if (!match) continue;
    const step = Number(match[1]);
    if (line.includes("✓")) {
      outcomes.set(step, VALIDATION_PIPELINE_DATA.outcome.pass);
    } else if (
      line.includes("⏭")
      || line.startsWith("Skipping")
      || line.includes("skipped")
    ) {
      outcomes.set(step, VALIDATION_PIPELINE_DATA.outcome.skip);
    } else {
      outcomes.set(step, VALIDATION_PIPELINE_DATA.outcome.fail);
    }
  }
  return outcomes;
}

export function parseValidationJsonOutput(stdout: string): AllValidationJsonOutput {
  return JSON.parse(stdout) as AllValidationJsonOutput;
}
