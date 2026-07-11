import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";

import { allCommand } from "@/commands/validation/all";
import { VALIDATION_STAGE_DISPLAY_NAMES } from "@/commands/validation/messages";
import {
  createValidationDomain,
  deriveValidationAllOverrideCliOptions,
  validationAllBuiltInCliOptions,
  validationAllOverrideCliOptions,
  validationCliDefinition,
  validationCommonCliOptions,
} from "@/interfaces/cli/validation";
import { formattingValidationLanguage } from "@/validation/languages/formatting";
import { markdownValidationLanguage } from "@/validation/languages/markdown";
import {
  VALIDATION_STAGE_PARTICIPATION,
  type ValidationStage,
  type ValidationStageContext,
} from "@/validation/languages/types";
import { typescriptValidationLanguage } from "@/validation/languages/typescript";
import { VALIDATION_REGISTRY_LANGUAGES, validationPipelineStages, validationRegistry } from "@/validation/registry";
import {
  arbitraryGeneratedValidationStageInsertion,
  arbitraryGeneratedValidationStageSet,
  arbitraryRegisteredValidationStageOutcomes,
  arbitraryValidationPipelineProjectCase,
  type GeneratedRegisteredValidationStageOutcome,
  type GeneratedValidationStageInsertion,
  type GeneratedValidationStageSpec,
  VALIDATION_PIPELINE_DATA,
  VALIDATION_PIPELINE_SCENARIO_KIND,
  validationPipelineBehaviorScenarios,
  validationPipelineComplianceScenarios,
  type ValidationPipelineProjectCase,
  type ValidationPipelineScenario,
  type ValidationStepOutcome,
} from "@testing/generators/validation/validation";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { runValidationInProcessWithDomains } from "@testing/harnesses/validation/cli";
import { withValidationEnv } from "@testing/harnesses/with-validation-env";

const EXPECTED_PIPELINE_STAGE_COUNT_FROM_SPEC_MAPPING = 7;
const OVERRIDE_METADATA_TEST_STAGE_NAME = "Override metadata test";
const OVERRIDE_METADATA_TEST_FLAG = "--override-metadata-test";
const OVERRIDE_METADATA_TEST_DESCRIPTION = "Override metadata test flag";
const OVERRIDE_METADATA_TEST_REASON = "override-metadata-test";
const NEGATED_OVERRIDE_METADATA_TEST_FLAG = "--no-override-metadata-test";
const VALUE_OVERRIDE_METADATA_TEST_FLAG = "--override-metadata-test <value>";
const ALIASED_OVERRIDE_METADATA_TEST_FLAG = "--override-metadata-test, -o";
const CAMEL_CASE_OVERRIDE_METADATA_TEST_FLAG = "--overrideMetadataTest";
const COLLIDING_OVERRIDE_METADATA_TEST_FLAG = "--overrideMetadata-test";
const STREAMING_PROBE_FIRST_STAGE_NAME = "Streaming probe first stage";
const STREAMING_PROBE_SECOND_STAGE_NAME = "Streaming probe second stage";
const STREAMING_PROBE_FIRST_STAGE_OUTPUT = `${STREAMING_PROBE_FIRST_STAGE_NAME}: passed`;
const STREAMING_PROBE_SECOND_STAGE_OUTPUT = `${STREAMING_PROBE_SECOND_STAGE_NAME}: passed`;

interface RecordedValidationStageCall {
  readonly context: ValidationStageContext;
  readonly stageName: string;
}

interface ValidationPipelineObservedResult {
  readonly exitCode: number;
  readonly outcomes: ReadonlyMap<string, ValidationStepOutcome>;
}

export function expectValidationRegistryDescriptors(): void {
  expect(validationRegistry.languages.length).toBeGreaterThan(0);
  for (const language of validationRegistry.languages) {
    expect(language.name.length).toBeGreaterThan(0);
    expect(language.stages.length).toBeGreaterThan(0);
    for (const stage of language.stages) {
      expect(stage.name.length).toBeGreaterThan(0);
      expect(stage.run).toBeInstanceOf(Function);
      expect(Object.values(VALIDATION_STAGE_PARTICIPATION)).toContain(stage.participation.default);
    }
  }
}

export function expectValidationRegistryLanguageSet(): void {
  expect(VALIDATION_REGISTRY_LANGUAGES).toEqual([
    typescriptValidationLanguage,
    markdownValidationLanguage,
    formattingValidationLanguage,
  ]);
  expect(validationRegistry.languages).toBe(VALIDATION_REGISTRY_LANGUAGES);
}

export function expectValidationPipelineTotalStageCount(): void {
  expect(registeredValidationStages()).toHaveLength(
    EXPECTED_PIPELINE_STAGE_COUNT_FROM_SPEC_MAPPING,
  );
}

export function registerValidationRuntimeMappingTests(): void {
  it.each([
    { stageName: VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR },
    { stageName: VALIDATION_STAGE_DISPLAY_NAMES.KNIP },
    { stageName: VALIDATION_STAGE_DISPLAY_NAMES.ESLINT },
    { stageName: VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT },
    { stageName: VALIDATION_STAGE_DISPLAY_NAMES.LITERAL },
  ])("TypeScript validation includes $stageName", ({ stageName }) => {
    expect(typescriptValidationLanguage.stages.map((stage) => stage.name)).toContain(stageName);
    expect(VALIDATION_REGISTRY_LANGUAGES).toContain(typescriptValidationLanguage);
  });

  it.each([
    { language: typescriptValidationLanguage },
    { language: markdownValidationLanguage },
    { language: formattingValidationLanguage },
  ])("validation registry composes $language.name descriptors into the full pipeline", ({ language }) => {
    expect(VALIDATION_REGISTRY_LANGUAGES).toContain(language);
    expect(validationRegistry.languages).toBe(VALIDATION_REGISTRY_LANGUAGES);
    for (const stage of language.stages) {
      expect(validationPipelineStages).toContain(stage);
    }
  });
}

export function registerValidationPipelinePropertyTests(): void {
  it("validation pipeline orchestration verdicts are deterministic for generated project state and stages", async () => {
    await assertProperty(
      arbitraryGeneratedValidationPipelineCase(),
      observeDeterministicPipelineCase,
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("adding a conforming stage at any position preserves registered stage verdicts", async () => {
    await assertProperty(
      arbitraryRegisteredValidationStageOutcomes().chain((outcomes) =>
        arbitraryGeneratedValidationStageInsertion(validationPipelineStages.length).map((insertion) => ({
          insertion,
          outcomes,
        }))
      ),
      expectGeneratedStageInsertionPreservesRegisteredOutcomes,
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
}

export function registerValidationPipelineSyntheticPropertyTests(): void {
  it("adding a generated stage at a generated position preserves existing generated stage verdicts", async () => {
    await assertProperty(
      arbitraryGeneratedValidationStageSet(),
      async ({ base, added, insertionIndex }) => {
        const additiveSpecs = [
          ...base.slice(0, insertionIndex),
          added,
          ...base.slice(insertionIndex),
        ];
        const baseResult = await allCommand({
          cwd: process.cwd(),
          validationStages: base.map(generatedValidationStage),
        });
        const additiveResult = await allCommand({
          cwd: process.cwd(),
          validationStages: additiveSpecs.map(generatedValidationStage),
        });
        const baseOutcomes = extractGeneratedStageOutcomes(baseResult.output, base);
        const additiveOutcomes = extractGeneratedStageOutcomes(additiveResult.output, base);

        for (const [stageName, outcome] of baseOutcomes) {
          expect(additiveOutcomes.get(stageName)).toBe(outcome);
        }
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
}

function arbitraryGeneratedValidationPipelineCase() {
  return arbitraryValidationPipelineProjectCase().chain((projectCase) =>
    arbitraryRegisteredValidationStageOutcomes().map((stageOutcomes) => ({ projectCase, stageOutcomes }))
  );
}

async function observeDeterministicPipelineCase(
  generatedCase: {
    readonly projectCase: ValidationPipelineProjectCase;
    readonly stageOutcomes: readonly GeneratedRegisteredValidationStageOutcome[];
  },
): Promise<void> {
  const { projectCase, stageOutcomes } = generatedCase;
  let observed: ValidationPipelineObservedResult | undefined;
  await withValidationEnv({ fixture: projectCase.fixture }, async ({ path }) => {
    await materializeValidationPipelineProjectCase(path, projectCase);
    const stages = registeredValidationStagesWithOutcomes(stageOutcomes);
    const first = await allCommand(validationAllCommandOptions(path, stages, projectCase));
    const second = await allCommand(validationAllCommandOptions(path, stages, projectCase));
    const firstOutcomes = extractStageOutcomesByName(first.output, stages);
    const secondOutcomes = extractStageOutcomesByName(second.output, stages);

    expect(second.exitCode).toBe(first.exitCode);
    expect(secondOutcomes).toEqual(firstOutcomes);

    observed = {
      exitCode: first.exitCode,
      outcomes: firstOutcomes,
    };
  });
  if (observed === undefined) {
    throw new Error(`Validation project case did not run: ${projectCase.title}`);
  }
}

async function expectGeneratedStageInsertionPreservesRegisteredOutcomes(
  generatedCase: {
    readonly insertion: GeneratedValidationStageInsertion;
    readonly outcomes: readonly GeneratedRegisteredValidationStageOutcome[];
  },
): Promise<void> {
  const { insertion, outcomes } = generatedCase;
  const base = registeredValidationStagesWithOutcomes(outcomes);
  const baseResult = await allCommand({ cwd: process.cwd(), validationStages: base });
  const additiveStages = [
    ...base.slice(0, insertion.insertionIndex),
    generatedValidationStage(insertion.added),
    ...base.slice(insertion.insertionIndex),
  ];
  const additiveResult = await allCommand({ cwd: process.cwd(), validationStages: additiveStages });
  const baseOutcomes = extractStageOutcomesByName(baseResult.output, base);
  const additiveOutcomes = extractStageOutcomesByName(additiveResult.output, base);

  for (const [stageName, outcome] of baseOutcomes) {
    expect(additiveOutcomes.get(stageName)).toBe(outcome);
  }
}

function validationAllCommandOptions(
  cwd: string,
  validationStages: readonly ValidationStage[],
  projectCase: ValidationPipelineProjectCase,
): Parameters<typeof allCommand>[0] {
  return {
    cwd,
    validationStages,
    ...(projectCase.files === undefined ? {} : { files: [...projectCase.files] }),
    ...(projectCase.scope === undefined ? {} : { scope: projectCase.scope }),
  };
}

async function materializeValidationPipelineProjectCase(
  productDir: string,
  projectCase: ValidationPipelineProjectCase,
): Promise<void> {
  for (const generatedFile of projectCase.generatedFiles) {
    const generatedPath = join(productDir, generatedFile.path);
    await mkdir(dirname(generatedPath), { recursive: true });
    await writeFile(generatedPath, generatedFile.content, VALIDATION_PIPELINE_DATA.fixtureTextEncoding);
  }
}

export function expectValidationAllOverrideOptionsDerived(): void {
  const descriptorOwnedOptions = registeredValidationStages()
    .flatMap((stage) => {
      const override = stage.participation.override;
      if (override === undefined) return [];
      return [{
        stageName: stage.name,
        flag: override.flag,
        description: override.description,
        reason: override.reason,
        optionPropertyName: descriptorOverrideOptionPropertyName(override.flag),
      }];
    });

  expect(validationAllOverrideCliOptions).toEqual(descriptorOwnedOptions);
  expect(validationAllOverrideCliOptions).toHaveLength(
    registeredValidationStages().filter((stage) => stage.participation.override !== undefined).length,
  );
}

export function expectValidationAllOverrideMetadataRejectsUnsupportedFlags(): void {
  for (
    const flag of [
      NEGATED_OVERRIDE_METADATA_TEST_FLAG,
      VALUE_OVERRIDE_METADATA_TEST_FLAG,
      ALIASED_OVERRIDE_METADATA_TEST_FLAG,
      CAMEL_CASE_OVERRIDE_METADATA_TEST_FLAG,
    ]
  ) {
    expect(() =>
      deriveValidationAllOverrideCliOptions([
        validationOverrideMetadataTestStage({ flag: invalidOverrideMetadataFlag(flag) }),
      ])
    ).toThrow();
  }
  expect(() =>
    deriveValidationAllOverrideCliOptions([
      validationOverrideMetadataTestStage({ flag: OVERRIDE_METADATA_TEST_FLAG }),
      validationOverrideMetadataTestStage({ flag: COLLIDING_OVERRIDE_METADATA_TEST_FLAG }),
    ])
  ).toThrow();
  for (
    const flag of [
      validationAllBuiltInCliOptions.fix.flag,
      validationCommonCliOptions.scope.flag,
      validationCommonCliOptions.quiet.flag,
      validationCommonCliOptions.json.flag,
      validationCliDefinition.commanderHelpOperands.longFlag,
    ]
  ) {
    expect(() =>
      deriveValidationAllOverrideCliOptions([
        validationOverrideMetadataTestStage({ flag: invalidOverrideMetadataFlag(flag) }),
      ])
    ).toThrow();
  }
  expect(() =>
    deriveValidationAllOverrideCliOptions([
      validationOverrideMetadataTestStage({
        defaultParticipation: VALIDATION_STAGE_PARTICIPATION.SKIP,
        defaultSkipReason: undefined,
        includeOverride: false,
      }),
    ])
  ).toThrow();
}

function invalidOverrideMetadataFlag(flag: string): `--${string}` {
  return flag as `--${string}`;
}

interface ValidationOverrideMetadataTestStageOptions {
  readonly flag?: `--${string}`;
  readonly defaultParticipation?: ValidationStage["participation"]["default"];
  readonly defaultSkipReason?: string;
  readonly includeOverride?: boolean;
  readonly override?: ValidationStage["participation"]["override"];
}

function validationOverrideMetadataTestStage(
  options: ValidationOverrideMetadataTestStageOptions = {},
): ValidationStage {
  return {
    name: OVERRIDE_METADATA_TEST_STAGE_NAME,
    failsPipeline: true,
    participation: {
      default: options.defaultParticipation ?? VALIDATION_STAGE_PARTICIPATION.RUN,
      defaultSkipReason: options.defaultSkipReason,
      ...(options.includeOverride === false
        ? {}
        : options.override === undefined
        ? {
          override: {
            flag: options.flag ?? OVERRIDE_METADATA_TEST_FLAG,
            description: OVERRIDE_METADATA_TEST_DESCRIPTION,
            participation: VALIDATION_STAGE_PARTICIPATION.SKIP,
            reason: OVERRIDE_METADATA_TEST_REASON,
          },
        }
        : { override: options.override }),
    },
    run: async () => ({
      exitCode: VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
      output: "",
    }),
  };
}

function descriptorOverrideOptionPropertyName(flag: `--${string}`): string {
  const words = flag.slice(2).split("-");
  return words
    .map((word, index) => (index === 0 ? word : `${word[0].toUpperCase()}${word.slice(1)}`))
    .join("");
}

function registeredValidationStages(): readonly ValidationStage[] {
  return validationRegistry.languages.flatMap((language) => language.stages);
}

export function registerValidationPipelineScenarioTests(): void {
  for (const scenario of validationPipelineBehaviorScenarios()) {
    it(
      scenario.title,
      { timeout: scenario.timeout },
      () => runValidationPipelineScenario(scenario),
    );
  }
}

export function registerValidationPipelineComplianceTests(): void {
  for (const scenario of validationPipelineComplianceScenarios()) {
    it(
      scenario.title,
      { timeout: scenario.timeout },
      () => runValidationPipelineScenario(scenario),
    );
  }
}

export async function runValidationPipelineScenario(scenario: ValidationPipelineScenario): Promise<void> {
  switch (scenario.kind) {
    case VALIDATION_PIPELINE_SCENARIO_KIND.CLEAN_PROJECT:
      return runCleanProjectScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.FAILURE_IDENTIFIES_STEP:
      return runFailureIdentifiesStepScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.PRODUCTION_SCOPE:
      return runProductionScopeScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.PATH_DIRECTORY_SCOPE:
      return runPathDirectoryScopeScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.PATH_FILE_SCOPE:
      return runPathFileScopeScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.STEP_ORDER:
      return runStepOrderScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.SKIP_CIRCULAR:
      return runSkipCircularScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.SKIP_LITERAL:
      return runSkipLiteralScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.NO_SHORT_CIRCUIT:
      return runNoShortCircuitScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.FAILURE_EXIT_CODE:
      return runFailureExitCodeScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.STEP_DURATION:
      return runStepDurationScenario(scenario);
  }
}

async function runCleanProjectScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  const calls: RecordedValidationStageCall[] = [];
  const result = await allCommand({
    cwd: process.cwd(),
    validationStages: recordingValidationStages(calls),
  });

  expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
  expect(calls.map((call) => call.stageName)).toEqual(
    defaultParticipatingStageNames(),
  );
  expectStepSequence(result.output);
  expect(result.output).toContain(`Validation ${VALIDATION_PIPELINE_DATA.summaryStatus.PASSED}`);
}

async function runFailureIdentifiesStepScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  const failingStage = validationPipelineStages.find((stage) =>
    stage.failsPipeline && stage.participation.default === VALIDATION_STAGE_PARTICIPATION.RUN
  );
  if (failingStage === undefined) throw new Error("Validation pipeline has no gating stage");
  const calls: RecordedValidationStageCall[] = [];
  const result = await allCommand({
    cwd: process.cwd(),
    validationStages: recordingValidationStages(calls, failingStage.name),
  });

  expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.FAILURE);
  expect(result.output).toContain(failingStage.name);
  expect(result.output).toContain(VALIDATION_PIPELINE_DATA.syntheticStageFailureDetail);
  expect(result.output).toContain(VALIDATION_PIPELINE_DATA.summaryStatus.FAILED);
}

async function runProductionScopeScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  const calls: RecordedValidationStageCall[] = [];
  const result = await allCommand({
    cwd: process.cwd(),
    scope: VALIDATION_PIPELINE_DATA.productionScope,
    validationStages: recordingValidationStages(calls),
  });

  expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
  expect(calls.map((call) => call.stageName)).toEqual(defaultParticipatingStageNames());
  for (const call of calls) {
    expect(call.context.scope).toBe(VALIDATION_PIPELINE_DATA.productionScope);
  }
}

async function runPathDirectoryScopeScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  await expectFileScopeForwardedToEveryStage(
    VALIDATION_PIPELINE_DATA.sourceDirectoryName,
  );
}

async function runPathFileScopeScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  await expectFileScopeForwardedToEveryStage(
    join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
  );
}

async function runStepOrderScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  const streamedOutput: string[] = [];
  let secondStageSawFirstStageOutput = false;
  const firstStage: ValidationStage = {
    name: STREAMING_PROBE_FIRST_STAGE_NAME,
    failsPipeline: true,
    participation: { default: VALIDATION_STAGE_PARTICIPATION.RUN },
    run: async () => ({
      exitCode: VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
      output: STREAMING_PROBE_FIRST_STAGE_OUTPUT,
    }),
  };
  const secondStage: ValidationStage = {
    name: STREAMING_PROBE_SECOND_STAGE_NAME,
    failsPipeline: true,
    participation: { default: VALIDATION_STAGE_PARTICIPATION.RUN },
    run: async () => {
      secondStageSawFirstStageOutput = streamedOutput.join(VALIDATION_PIPELINE_DATA.outputLineSeparator)
        .includes(STREAMING_PROBE_FIRST_STAGE_OUTPUT);
      return {
        exitCode: VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
        output: STREAMING_PROBE_SECOND_STAGE_OUTPUT,
      };
    },
  };

  const result = await runValidationInProcessWithDomains(
    [validationCliDefinition.subcommands.all.commandName],
    [createValidationDomain({ validationStages: [firstStage, secondStage] })],
    { onStdout: (output) => streamedOutput.push(output) },
  );

  expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
  expect(secondStageSawFirstStageOutput).toBe(true);
  expect(streamedOutput.join(VALIDATION_PIPELINE_DATA.outputLineSeparator).indexOf(STREAMING_PROBE_FIRST_STAGE_OUTPUT))
    .toBeLessThan(
      streamedOutput.join(VALIDATION_PIPELINE_DATA.outputLineSeparator).indexOf(STREAMING_PROBE_SECOND_STAGE_OUTPUT),
    );
}

async function runSkipCircularScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  await expectStageOverrideBehavior(
    VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR,
    VALIDATION_PIPELINE_DATA.skipCircularFlag,
    VALIDATION_PIPELINE_DATA.circularSkipOutput,
    VALIDATION_PIPELINE_DATA.circularSkipJsonOutput,
  );
}

async function runSkipLiteralScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  await expectStageOverrideBehavior(
    VALIDATION_STAGE_DISPLAY_NAMES.LITERAL,
    VALIDATION_PIPELINE_DATA.skipLiteralFlag,
    VALIDATION_PIPELINE_DATA.literalSkipOutput,
    VALIDATION_PIPELINE_DATA.literalSkipJsonOutput,
  );
}

async function runNoShortCircuitScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  for (const failingStage of defaultParticipatingGatingStages()) {
    const calls: RecordedValidationStageCall[] = [];
    const result = await allCommand({
      cwd: process.cwd(),
      validationStages: recordingValidationStages(calls, failingStage.name),
    });

    expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.FAILURE);
    expect(calls.map((call) => call.stageName)).toEqual(
      defaultParticipatingStageNames(),
    );
  }
}

async function runFailureExitCodeScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  for (const stage of defaultParticipatingGatingStages()) {
    const result = await allCommand({
      cwd: process.cwd(),
      validationStages: recordingValidationStages([], stage.name),
    });

    expect(result.exitCode).not.toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
  }
}

async function runStepDurationScenario(_scenario: ValidationPipelineScenario): Promise<void> {
  const runningResult = await allCommand({
    cwd: process.cwd(),
    validationStages: recordingValidationStages([]),
  });
  expectEveryStepLineHasDuration(runningResult.output);

  const overriddenStage = validationPipelineStages.find((stage) =>
    stage.participation.default === VALIDATION_STAGE_PARTICIPATION.RUN
    && stage.participation.override !== undefined
  );
  if (overriddenStage?.participation.override === undefined) {
    throw new Error("Validation pipeline has no default-running stage with an override");
  }
  const skippedResult = await allCommand({
    cwd: process.cwd(),
    participationOverrides: [overriddenStage.participation.override.flag],
    validationStages: recordingValidationStages([]),
  });
  expectEveryStepLineHasDuration(skippedResult.output);
}

function recordingValidationStages(
  calls: RecordedValidationStageCall[],
  failingStageName?: string,
): readonly ValidationStage[] {
  return validationPipelineStages.map((stage) => ({
    ...stage,
    run: async (context) => {
      calls.push({ context, stageName: stage.name });
      const failed = stage.name === failingStageName;
      return {
        exitCode: failed
          ? VALIDATION_PIPELINE_DATA.exitCodes.FAILURE
          : VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
        output: `${stage.name}: ${
          failed
            ? VALIDATION_PIPELINE_DATA.syntheticStageFailureDetail
            : VALIDATION_PIPELINE_DATA.summaryStatus.PASSED
        }`,
      };
    },
  }));
}

function registeredValidationStagesWithOutcomes(
  outcomes: readonly GeneratedRegisteredValidationStageOutcome[],
): readonly ValidationStage[] {
  return validationPipelineStages.map((stage, index) => {
    const outcome = outcomes[index];
    return {
      ...stage,
      run: async () => ({
        ...outcome,
        output: `${stage.name}: ${outcome.output}`,
      }),
    };
  });
}

async function expectFileScopeForwardedToEveryStage(target: string): Promise<void> {
  const calls: RecordedValidationStageCall[] = [];
  const result = await allCommand({
    cwd: process.cwd(),
    files: [target],
    validationStages: recordingValidationStages(calls),
  });

  expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
  expect(calls.map((call) => call.stageName)).toEqual(defaultParticipatingStageNames());
  for (const call of calls) {
    expect(call.context.files).toEqual([target]);
  }
}

async function expectStageOverrideBehavior(
  stageName: string,
  overrideFlag: `--${string}`,
  skipOutput: string,
  skipJsonOutput: string,
): Promise<void> {
  const expectedCalledStages = validationPipelineStages
    .filter((stage) => stage.name !== stageName && stage.participation.default === VALIDATION_STAGE_PARTICIPATION.RUN)
    .map((stage) => stage.name);

  const humanCalls: RecordedValidationStageCall[] = [];
  const humanResult = await allCommand({
    cwd: process.cwd(),
    participationOverrides: [overrideFlag],
    validationStages: recordingValidationStages(humanCalls),
  });
  expect(humanResult.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
  expect(humanCalls.map((call) => call.stageName)).toEqual(expectedCalledStages);
  expect(humanResult.output).toContain(skipOutput);
  expectStepSequence(humanResult.output);

  const quietCalls: RecordedValidationStageCall[] = [];
  const quietResult = await allCommand({
    cwd: process.cwd(),
    participationOverrides: [overrideFlag],
    quiet: true,
    validationStages: recordingValidationStages(quietCalls),
  });
  expect(quietResult.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
  expect(quietCalls.map((call) => call.stageName)).toEqual(expectedCalledStages);
  expect(quietResult.output).toHaveLength(0);

  const jsonCalls: RecordedValidationStageCall[] = [];
  const jsonResult = await allCommand({
    cwd: process.cwd(),
    json: true,
    participationOverrides: [overrideFlag],
    validationStages: recordingValidationStages(jsonCalls),
  });
  expect(jsonResult.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
  expect(jsonCalls.map((call) => call.stageName)).toEqual(expectedCalledStages);
  expect(jsonResult.output).toContain(skipJsonOutput);
  expect(jsonResult.output).not.toContain(skipOutput);

  const productionCalls: RecordedValidationStageCall[] = [];
  const productionResult = await allCommand({
    cwd: process.cwd(),
    scope: VALIDATION_PIPELINE_DATA.productionScope,
    participationOverrides: [overrideFlag],
    validationStages: recordingValidationStages(productionCalls),
  });
  expect(productionResult.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
  expect(productionCalls.map((call) => call.stageName)).toEqual(expectedCalledStages);
  expect(productionResult.output).toContain(skipOutput);
  for (const call of productionCalls) {
    expect(call.context.scope).toBe(VALIDATION_PIPELINE_DATA.productionScope);
  }
}

function defaultParticipatingStageNames(): readonly string[] {
  return validationPipelineStages
    .filter((stage) => stage.participation.default === VALIDATION_STAGE_PARTICIPATION.RUN)
    .map((stage) => stage.name);
}

function defaultParticipatingGatingStages(): readonly ValidationStage[] {
  return validationPipelineStages.filter((stage) =>
    stage.failsPipeline && stage.participation.default === VALIDATION_STAGE_PARTICIPATION.RUN
  );
}

function expectEveryStepLineHasDuration(output: string): void {
  const lines = output.split(VALIDATION_PIPELINE_DATA.outputLineSeparator)
    .filter((line) => [...line.matchAll(VALIDATION_PIPELINE_DATA.stepLinePattern)].length > 0);

  expect(lines).toHaveLength(VALIDATION_PIPELINE_DATA.totalSteps);
  for (const line of lines) {
    expect(line).toMatch(VALIDATION_PIPELINE_DATA.stepDurationPattern);
  }
}

function expectStepSequence(stdout: string): void {
  const stepMarkers = [...stdout.matchAll(VALIDATION_PIPELINE_DATA.stepLinePattern)];
  expect(stepMarkers).toHaveLength(VALIDATION_PIPELINE_DATA.totalSteps);
  expect(stepMarkers.map((match) => Number(match[1]))).toEqual(VALIDATION_PIPELINE_DATA.expectedStepNumbers);
  // Every step line's denominator must equal the registry-derived step count,
  // so a wrong denominator surfaced in CLI output (e.g. [1/5] while six stages
  // run) fails rather than passing on step numbers alone.
  expect(stepMarkers.map((match) => Number(match[2]))).toEqual(
    VALIDATION_PIPELINE_DATA.expectedStepNumbers.map(() => VALIDATION_PIPELINE_DATA.totalSteps),
  );
}

function generatedValidationStage(spec: GeneratedValidationStageSpec): ValidationStage {
  return {
    name: spec.name,
    failsPipeline: spec.failsPipeline,
    participation: {
      default: VALIDATION_STAGE_PARTICIPATION.RUN,
    },
    run: async () => ({
      exitCode: spec.exitCode,
      output: `${spec.name}: ${spec.output}`,
    }),
  };
}

function extractStageOutcomesByName(
  stdout: string,
  stages: readonly ValidationStage[],
): Map<string, ValidationStepOutcome> {
  const namedOutcomes = new Map<string, ValidationStepOutcome>();
  for (const line of stdout.split(VALIDATION_PIPELINE_DATA.outputLineSeparator)) {
    const match = [...line.matchAll(VALIDATION_PIPELINE_DATA.stepLinePattern)].at(0);
    if (!match) continue;
    const stage = stages.find((candidate) => line.includes(candidate.name));
    if (stage === undefined) continue;
    const outcome = validationStepOutcomeFromLine(line);
    if (outcome !== undefined) namedOutcomes.set(stage.name, outcome);
  }
  return namedOutcomes;
}

function extractGeneratedStageOutcomes(
  stdout: string,
  stages: readonly GeneratedValidationStageSpec[],
): Map<string, ValidationStepOutcome> {
  const outcomes = new Map<string, ValidationStepOutcome>();
  for (const line of stdout.split(VALIDATION_PIPELINE_DATA.outputLineSeparator)) {
    const stage = stages.find((candidate) => line.includes(`${candidate.name}:`));
    if (stage === undefined) continue;
    const outcome = validationStepOutcomeFromLine(line);
    if (outcome !== undefined) {
      outcomes.set(stage.name, outcome);
    }
  }
  return outcomes;
}

function validationStepOutcomeFromLine(line: string): ValidationStepOutcome | undefined {
  if (
    line.includes("✓") || line.includes("No issues found") || line.includes("No cycles")
    || line.includes("No type errors") || line.includes("None found")
  ) {
    return VALIDATION_PIPELINE_DATA.outcome.pass;
  }
  if (line.includes("⏭") || line.startsWith("Skipping") || line.includes("skipped")) {
    return VALIDATION_PIPELINE_DATA.outcome.skip;
  }
  if ([...line.matchAll(VALIDATION_PIPELINE_DATA.stepLinePattern)].length > 0) {
    return VALIDATION_PIPELINE_DATA.outcome.fail;
  }
  return undefined;
}
