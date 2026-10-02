import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

import { allCommand } from "@/commands/validation";
import { formatValidationNoProblemsMessage } from "@/commands/validation/messages";
import {
  ALL_VALIDATION_JSON_FIELD,
  type AllValidationJsonOutput,
  type ValidationCommandResult,
} from "@/commands/validation/types";
import {
  createValidationDomain,
  deriveValidationAllOverrideCliOptions,
  validationAllOverrideCliOptions,
  validationOptionPropertyName,
} from "@/interfaces/cli/validation";
import {
  validationAllBuiltInCliOptions,
  validationCliDefinition,
  validationCommonCliOptions,
} from "@/interfaces/cli/validation-contract";
import { VALIDATION_STAGE_PARTICIPATION, type ValidationStage } from "@/validation/languages/types";
import { validationPipelineStages } from "@/validation/registry";
import {
  arbitraryValidationAdditiveStageScenario,
  arbitraryValidationStableVerdictScenario,
  VALIDATION_PIPELINE_DATA,
  VALIDATION_PIPELINE_SCENARIO_KIND,
  type ValidationPipelineScenario,
  validationPipelineScenarios,
  type ValidationStableVerdictScenario,
  type ValidationStepOutcome,
} from "@testing/generators/validation/validation";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import {
  createRecordingValidationDomain,
  expectValidationSubprocessResult,
  runValidationInProcess,
  runValidationSubprocess,
  VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
  VALIDATION_REPEATED_PIPELINE_TIMEOUT,
  validationCliEmptyOutput,
  type ValidationCliResult,
} from "@testing/harnesses/validation/cli";
import { collectHarnessTestCases, describe, it } from "@testing/harnesses/vitest-registration";
import {
  PROJECT_FIXTURES,
  VALIDATION_FIXTURE_TEXT_ENCODING,
  withValidationEnv,
} from "@testing/harnesses/with-validation-env";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const VALIDATION_ROOT = resolve(
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
function validationPipelineScenarioTimeout(kind: ValidationPipelineScenario["kind"]): number {
  return kind === VALIDATION_PIPELINE_SCENARIO_KIND.STABLE_VERDICT
      || kind === VALIDATION_PIPELINE_SCENARIO_KIND.ADDITIVE_VERDICTS
    ? VALIDATION_REPEATED_PIPELINE_TIMEOUT
    : VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT;
}

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

function deferred(): Deferred {
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
    case VALIDATION_PIPELINE_SCENARIO_KIND.STABLE_VERDICT:
      return runStableVerdictScenario(scenario);
    case VALIDATION_PIPELINE_SCENARIO_KIND.ADDITIVE_VERDICTS:
      return runAdditiveVerdictsScenario(scenario);
  }
}

const VALIDATION_SCENARIO_KINDS = new Set([
  VALIDATION_PIPELINE_SCENARIO_KIND.CLEAN_PROJECT,
  VALIDATION_PIPELINE_SCENARIO_KIND.FAILURE_IDENTIFIES_STEP,
  VALIDATION_PIPELINE_SCENARIO_KIND.PRODUCTION_SCOPE,
  VALIDATION_PIPELINE_SCENARIO_KIND.PATH_DIRECTORY_SCOPE,
  VALIDATION_PIPELINE_SCENARIO_KIND.PATH_FILE_SCOPE,
  VALIDATION_PIPELINE_SCENARIO_KIND.STEP_ORDER,
]);
const VALIDATION_PROPERTY_KINDS = new Set([
  VALIDATION_PIPELINE_SCENARIO_KIND.STABLE_VERDICT,
  VALIDATION_PIPELINE_SCENARIO_KIND.ADDITIVE_VERDICTS,
]);
const VALIDATION_COMPLIANCE_KINDS = new Set([
  VALIDATION_PIPELINE_SCENARIO_KIND.NO_SHORT_CIRCUIT,
  VALIDATION_PIPELINE_SCENARIO_KIND.FAILURE_EXIT_CODE,
  VALIDATION_PIPELINE_SCENARIO_KIND.STEP_DURATION,
]);
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
        validationPipelineScenarioTimeout(scenario.kind),
      );
    }
  });
}

export const validationPipelineScenarioCases = collectHarnessTestCases(() => {
  registerValidationPipelineTests(
    "validation pipeline scenarios",
    VALIDATION_SCENARIO_KINDS,
  );
});
export const validationPipelinePropertyCases = collectHarnessTestCases(() => {
  registerValidationPipelineTests(
    "validation pipeline properties",
    VALIDATION_PROPERTY_KINDS,
  );
});
export const validationPipelineComplianceCases = collectHarnessTestCases(() => {
  registerValidationPipelineTests(
    "validation pipeline compliance",
    VALIDATION_COMPLIANCE_KINDS,
  );
});
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

export function expectValidationAllOverrideMetadataRejectsUnsupportedFlags(): void {
  for (const flag of UNSUPPORTED_OVERRIDE_METADATA_FLAGS) {
    expect(() => deriveValidationAllOverrideCliOptions([validationOverrideMetadataTestStage(flag)])).toThrow();
  }
  expect(() =>
    deriveValidationAllOverrideCliOptions([
      validationOverrideMetadataTestStage(OVERRIDE_METADATA_TEST_FLAG),
      validationOverrideMetadataTestStage(COLLIDING_OVERRIDE_METADATA_TEST_FLAG),
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
    expect(() => deriveValidationAllOverrideCliOptions([validationOverrideMetadataTestStage(flag)])).toThrow();
  }
  expect(() =>
    deriveValidationAllOverrideCliOptions([{
      ...validationOverrideMetadataTestStage(OVERRIDE_METADATA_TEST_FLAG),
      participation: {
        ...validationOverrideMetadataTestStage(OVERRIDE_METADATA_TEST_FLAG).participation,
        skipReason: "",
      },
    }])
  ).toThrow();
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

async function runAll(
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

function expectJsonStageDiagnostics(result: ValidationCliResult, stageName: string): void {
  expect(parseAllValidationJson(result).steps).toContainEqual(expect.objectContaining({
    [ALL_VALIDATION_JSON_FIELD.NAME]: stageName,
    [ALL_VALIDATION_JSON_FIELD.STDOUT]: expect.stringMatching(/\S/u),
    [ALL_VALIDATION_JSON_FIELD.STDERR]: expect.any(String),
  }));
}

async function runCleanProjectScenario(
  _scenario: ValidationPipelineScenario,
): Promise<void> {
  await withValidationEnv(
    { fixture: PROJECT_FIXTURES.CLEAN_PROJECT },
    async ({ path }) => {
      const result = await runAll(path);

      expectValidationSubprocessResult(result, {
        title: _scenario.title,
        args: [],
        expectedExitCode: VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
        stdoutIncludes: [
          `Validation ${VALIDATION_PIPELINE_DATA.summaryStatus.PASSED}`,
        ],
        combinedIncludes: [],
        stdoutExcludes: [],
        stderrExcludes: [],
        combinedExcludes: [],
      });
      expectStepSequence(result.stdout);
      const outcomes = extractStepOutcomes(result.stdout);
      expect(outcomes.size).toBe(VALIDATION_PIPELINE_DATA.totalSteps);
      expect([...outcomes.values()]).not.toContain(
        VALIDATION_PIPELINE_DATA.outcome.fail,
      );
    },
  );
}

async function runJsonDocumentComplianceScenario(): Promise<void> {
  await withValidationEnv(
    { fixture: PROJECT_FIXTURES.CLEAN_PROJECT },
    async ({ path }) => {
      const jsonResult = await runAll(path, [VALIDATION_PIPELINE_DATA.jsonFlag]);
      expect(jsonResult.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
      expect(parseAllValidationJson(jsonResult).success).toBe(true);

      const quietJsonResult = await runAll(path, [
        VALIDATION_PIPELINE_DATA.quietFlag,
        VALIDATION_PIPELINE_DATA.jsonFlag,
      ]);
      expect(quietJsonResult.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
      expect(parseAllValidationJson(quietJsonResult).success).toBe(true);
    },
  );
}

async function runFailureIdentifiesStepScenario(
  _scenario: ValidationPipelineScenario,
): Promise<void> {
  await withValidationEnv(
    { fixture: PROJECT_FIXTURES.WITH_CIRCULAR_DEPS },
    async ({ path }) => {
      const result = await runAll(path);

      expectValidationSubprocessResult(result, {
        title: _scenario.title,
        args: [],
        expectedExitCode: VALIDATION_PIPELINE_DATA.exitCodes.FAILURE,
        stdoutIncludes: [
          VALIDATION_PIPELINE_DATA.circularOutput.FOUND,
        ],
        combinedIncludes: [`Validation ${VALIDATION_PIPELINE_DATA.summaryStatus.FAILED}`],
        stdoutExcludes: [],
        stderrExcludes: [],
        combinedExcludes: [],
      });
      const circularSourceFiles = await readdir(
        join(path, VALIDATION_PIPELINE_DATA.sourceDirectoryName),
      );
      for (const sourceFile of circularSourceFiles) {
        expect(result.stdout).toContain(
          join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, sourceFile),
        );
      }
    },
  );
}

async function runProductionScopeScenario(
  _scenario: ValidationPipelineScenario,
): Promise<void> {
  await withValidationEnv(
    { fixture: PROJECT_FIXTURES.CLEAN_PROJECT },
    async ({ path }) => {
      const fullConfigPath = join(
        path,
        VALIDATION_PIPELINE_DATA.fullTsconfigFile,
      );
      const fullConfig = JSON.parse(
        await readFile(
          fullConfigPath,
          VALIDATION_FIXTURE_TEXT_ENCODING,
        ),
      ) as {
        include?: string[];
      };
      fullConfig.include = [
        VALIDATION_PIPELINE_DATA.productionScopeFilePattern,
        VALIDATION_PIPELINE_DATA.absentScopeFilePattern,
      ];
      await writeFile(
        fullConfigPath,
        JSON.stringify(fullConfig),
        VALIDATION_FIXTURE_TEXT_ENCODING,
      );
      await writeFile(
        join(path, VALIDATION_PIPELINE_DATA.productionTsconfigFile),
        VALIDATION_PIPELINE_DATA.productionTsconfigContent,
        VALIDATION_FIXTURE_TEXT_ENCODING,
      );
      const scriptsDirectory = join(
        path,
        VALIDATION_PIPELINE_DATA.scriptSourceDirectoryName,
      );
      await mkdir(scriptsDirectory, { recursive: true });
      await writeFile(
        join(
          scriptsDirectory,
          VALIDATION_PIPELINE_DATA.secondarySourceFileName,
        ),
        VALIDATION_PIPELINE_DATA.secondaryTypeErrorSourceContent,
        VALIDATION_FIXTURE_TEXT_ENCODING,
      );

      const fullResult = await runAll(path);
      const result = await runAll(path, [
        VALIDATION_PIPELINE_DATA.scopeFlag,
        VALIDATION_PIPELINE_DATA.productionScope,
      ]);

      const recorder = createRecordingValidationDomain(
        VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
      );
      await runValidationInProcess(
        [
          validationCliDefinition.subcommands.all.commandName,
          VALIDATION_PIPELINE_DATA.scopeFlag,
          VALIDATION_PIPELINE_DATA.productionScope,
        ],
        { domain: recorder.domain, processCwd: () => path },
      );

      expect(fullResult.exitCode).toBe(
        VALIDATION_PIPELINE_DATA.exitCodes.FAILURE,
      );
      expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
      expectStepSequence(result.stdout);
      expect(recorder.calls).toHaveLength(1);
      expect(recorder.calls[0]?.commandName).toBe(
        validationCliDefinition.subcommands.all.commandName,
      );
      expect(recorder.calls[0]?.options.scope).toBe(
        VALIDATION_PIPELINE_DATA.productionScope,
      );
    },
  );
}

async function runPathDirectoryScopeScenario(
  _scenario: ValidationPipelineScenario,
): Promise<void> {
  await withValidationEnv(
    { fixture: PROJECT_FIXTURES.CLEAN_PROJECT },
    async ({ path }) => {
      const outOfScopeDirectory = join(
        path,
        VALIDATION_PIPELINE_DATA.outOfScopeMarkdownDirectoryName,
      );
      await mkdir(outOfScopeDirectory, { recursive: true });
      await writeFile(
        join(
          outOfScopeDirectory,
          VALIDATION_PIPELINE_DATA.outOfScopeMarkdownFileName,
        ),
        VALIDATION_PIPELINE_DATA.outOfScopeMarkdownContent,
      );

      const unscopedResult = await runAll(path, [
        VALIDATION_PIPELINE_DATA.skipCircularFlag,
      ]);
      expect(unscopedResult.exitCode).toBe(
        VALIDATION_PIPELINE_DATA.exitCodes.FAILURE,
      );
      expect(unscopedResult.stdout).toContain(
        VALIDATION_PIPELINE_DATA.stageNames.FORMATTING,
      );

      const targetDirectory = VALIDATION_PIPELINE_DATA.sourceDirectoryName;
      const result = await runAll(path, [
        VALIDATION_PIPELINE_DATA.skipCircularFlag,
        targetDirectory,
      ]);

      expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
      expectStepSequence(result.stdout);
    },
  );
}

async function runPathFileScopeScenario(
  _scenario: ValidationPipelineScenario,
): Promise<void> {
  await withValidationEnv(
    { fixture: PROJECT_FIXTURES.CLEAN_PROJECT },
    async ({ path }) => {
      const outOfScopeDirectory = join(
        path,
        VALIDATION_PIPELINE_DATA.outOfScopeMarkdownDirectoryName,
      );
      await mkdir(outOfScopeDirectory, { recursive: true });
      await writeFile(
        join(
          outOfScopeDirectory,
          VALIDATION_PIPELINE_DATA.outOfScopeMarkdownFileName,
        ),
        VALIDATION_PIPELINE_DATA.outOfScopeMarkdownContent,
      );

      const unscopedResult = await runAll(path, [
        VALIDATION_PIPELINE_DATA.skipCircularFlag,
      ]);
      expect(unscopedResult.exitCode).toBe(
        VALIDATION_PIPELINE_DATA.exitCodes.FAILURE,
      );
      expect(unscopedResult.stdout).toContain(
        VALIDATION_PIPELINE_DATA.stageNames.FORMATTING,
      );

      const targetFile = join(
        VALIDATION_PIPELINE_DATA.sourceDirectoryName,
        VALIDATION_PIPELINE_DATA.cleanSourceFileName,
      );
      const result = await runAll(path, [
        VALIDATION_PIPELINE_DATA.skipCircularFlag,
        targetFile,
      ]);
      const recorder = createRecordingValidationDomain(
        VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
      );
      await runValidationInProcess(
        [
          validationCliDefinition.subcommands.all.commandName,
          VALIDATION_PIPELINE_DATA.skipCircularFlag,
          targetFile,
        ],
        { domain: recorder.domain, processCwd: () => path },
      );

      expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
      expectStepSequence(result.stdout);
      expect(recorder.calls).toHaveLength(1);
      expect(recorder.calls[0]?.commandName).toBe(
        validationCliDefinition.subcommands.all.commandName,
      );
      expect(recorder.calls[0]?.options.files).toEqual([targetFile]);
    },
  );
}

async function runStepOrderScenario(
  _scenario: ValidationPipelineScenario,
): Promise<void> {
  const secondStageStarted = deferred();
  const releaseSecondStage = deferred();
  const streamedOutput: string[] = [];
  const stages: readonly ValidationStage[] = [
    {
      name: VALIDATION_PIPELINE_DATA.stageNames.ESLINT,
      failsPipeline: true,
      participation: validationParticipationPolicy(VALIDATION_PIPELINE_DATA.stageNames.ESLINT),
      run: () =>
        Promise.resolve({
          exitCode: VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
          output: VALIDATION_PIPELINE_DATA.stageNames.ESLINT,
        }),
    },
    {
      name: VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT,
      failsPipeline: true,
      participation: validationParticipationPolicy(VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT),
      run: async () => {
        secondStageStarted.resolve();
        await releaseSecondStage.promise;
        return {
          exitCode: VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
          output: VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT,
        };
      },
    },
  ];

  const domain = createValidationDomain({ validationStages: stages });
  const run = runValidationInProcess(
    [validationCliDefinition.subcommands.all.commandName],
    {
      domain,
      processCwd: () => VALIDATION_ROOT,
      writeStdout: (output) => streamedOutput.push(output),
    },
  );
  await secondStageStarted.promise;
  try {
    expect(streamedOutput).toHaveLength(1);
    expect(streamedOutput[0]).toContain(
      VALIDATION_PIPELINE_DATA.stageNames.ESLINT,
    );
  } finally {
    releaseSecondStage.resolve();
  }
  const result = await run;
  expect(result.stdout.indexOf(VALIDATION_PIPELINE_DATA.stageNames.ESLINT)).toBeLessThan(
    result.stdout.indexOf(VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT),
  );
}

async function runSkipCircularScenario(
  _scenario: ValidationPipelineScenario,
): Promise<void> {
  await withValidationEnv(
    { fixture: PROJECT_FIXTURES.CLEAN_PROJECT },
    async ({ path }) => {
      await writeCircularSkipFixture(path);

      const result = await runAll(path, [
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

      const quietResult = await runAll(path, [
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

      const jsonResult = await runAll(path, [
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

      const quietJsonResult = await runAll(path, [
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

      const productionResult = await runAll(path, [
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

      const result = await runAll(path, [
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

      const quietResult = await runAll(path, [
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

      const jsonResult = await runAll(path, [
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

      const quietJsonResult = await runAll(path, [
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

      const productionResult = await runAll(path, [
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

async function runNoShortCircuitScenario(
  _scenario: ValidationPipelineScenario,
): Promise<void> {
  await withValidationEnv(
    { fixture: PROJECT_FIXTURES.WITH_CIRCULAR_DEPS },
    async ({ path }) => {
      const result = await runAll(path);

      expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.FAILURE);
      expectStepSequence(result.stdout);
      expectCanonicalProblemVocabulary(result.stdout);
      expect(result.stdout).toContain(
        VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT,
      );
      expect(result.stdout).toContain(
        VALIDATION_PIPELINE_DATA.stageNames.MARKDOWN,
      );
      expect(result.stdout).toContain(
        VALIDATION_PIPELINE_DATA.stageNames.LITERAL,
      );
    },
  );
}

function expectCanonicalProblemVocabulary(stdout: string): void {
  const completionLines = stdout
    .split(VALIDATION_PIPELINE_DATA.outputLineSeparator)
    .filter((line) => /^\[\d+\/\d+\]/u.test(line));
  expect(completionLines).toHaveLength(VALIDATION_PIPELINE_DATA.totalSteps);
  for (const line of completionLines) {
    if (/\bskipped\b/u.test(line)) continue;
    expect(line).toMatch(/\bproblems?\b/u);
  }
}

async function runFailureExitCodeScenario(
  _scenario: ValidationPipelineScenario,
): Promise<void> {
  for (const failingStage of validationPipelineStages.filter((stage) => stage.failsPipeline)) {
    const stages = validationPipelineStages.map((stage): ValidationStage => ({
      ...stage,
      run: () =>
        Promise.resolve({
          exitCode: stage.name === failingStage.name
            ? VALIDATION_PIPELINE_DATA.exitCodes.FAILURE
            : VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
          output: stage.name === failingStage.name
            ? stage.name
            : formatValidationNoProblemsMessage(stage.name),
        }),
    }));
    const result = await allCommand({ cwd: VALIDATION_ROOT, quiet: true, validationStages: stages });

    expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.FAILURE);
  }

  await withValidationEnv(
    { fixture: PROJECT_FIXTURES.WITH_TYPE_ERRORS },
    async ({ path }) => {
      const result = await runAll(path);

      expect(result.exitCode).not.toBe(
        VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
      );

      const jsonResult = await runAll(path, [
        VALIDATION_PIPELINE_DATA.quietFlag,
        VALIDATION_PIPELINE_DATA.jsonFlag,
      ]);

      expect(jsonResult.exitCode).not.toBe(
        VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
      );
      expectJsonStageDiagnostics(
        jsonResult,
        VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT,
      );
    },
  );
}

async function runStepDurationScenario(
  _scenario: ValidationPipelineScenario,
): Promise<void> {
  await withValidationEnv(
    { fixture: PROJECT_FIXTURES.CLEAN_PROJECT },
    async ({ path }) => {
      const result = await runAll(path);
      const lines = result.stdout
        .split(VALIDATION_PIPELINE_DATA.outputLineSeparator)
        .filter(
          (line) =>
            [...line.matchAll(VALIDATION_PIPELINE_DATA.stepLinePattern)]
              .length > 0,
        );

      expect(lines).toHaveLength(VALIDATION_PIPELINE_DATA.totalSteps);
      for (const line of lines) {
        expect(line).toMatch(VALIDATION_PIPELINE_DATA.stepDurationPattern);
      }
    },
  );

  const mixedVerdictStages = validationPipelineStages.map((stage): ValidationStage => {
    if (stage.name === VALIDATION_PIPELINE_DATA.stageNames.KNIP) {
      return {
        ...stage,
        participation: {
          ...stage.participation,
          default: VALIDATION_STAGE_PARTICIPATION.SKIP,
          skipReason: stage.name,
        },
      };
    }
    return {
      ...stage,
      participation: stage.participation,
      run: () =>
        Promise.resolve({
          exitCode: stage.name === VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT
            ? VALIDATION_PIPELINE_DATA.exitCodes.FAILURE
            : VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
          output: stage.name === VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT
            ? stage.name
            : formatValidationNoProblemsMessage(stage.name),
        }),
    };
  });
  const mixedResult = await allCommand({ cwd: VALIDATION_ROOT }, { stages: mixedVerdictStages });
  const mixedLines = mixedResult.output
    .split(VALIDATION_PIPELINE_DATA.outputLineSeparator)
    .filter((line) => [...line.matchAll(VALIDATION_PIPELINE_DATA.stepLinePattern)].length > 0);

  expect(mixedLines).toHaveLength(mixedVerdictStages.length);
  for (const line of mixedLines) {
    expect(line).toMatch(VALIDATION_PIPELINE_DATA.stepDurationPattern);
  }
}

async function runStableVerdictScenario(
  _scenario: ValidationPipelineScenario,
): Promise<void> {
  await assertProperty(
    arbitraryValidationStableVerdictScenario(),
    async (generatedScenario) => {
      const first = await executeStableVerdictRun(generatedScenario);
      const second = await executeStableVerdictRun(generatedScenario);

      expect(second.result).toEqual(first.result);
      expect(second.executedStageVerdicts).toEqual(first.executedStageVerdicts);
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
}

interface StableVerdictRun {
  readonly result: ValidationCommandResult;
  readonly executedStageVerdicts: readonly ValidationCommandResult[];
}

async function executeStableVerdictRun(
  scenario: ValidationStableVerdictScenario,
): Promise<StableVerdictRun> {
  const executedStageVerdicts: ValidationCommandResult[] = [];
  const validationStages = validationPipelineStages.map(
    (stage, index): ValidationStage => ({
      name: stage.name,
      failsPipeline: true,
      participation: stage.participation,
      run: () => {
        const result = {
          exitCode: scenario.stageFailures[index]
            ? VALIDATION_PIPELINE_DATA.exitCodes.FAILURE
            : VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
          output: scenario.stageFailures[index]
            ? stage.name
            : formatValidationNoProblemsMessage(stage.name),
        };
        executedStageVerdicts.push(result);
        return Promise.resolve(result);
      },
    }),
  );
  const result = await allCommand(
    { cwd: VALIDATION_ROOT, ...scenario.commandOptions, validationStages },
    { now: () => 0 },
  );
  return { result, executedStageVerdicts };
}

async function runAdditiveVerdictsScenario(
  _scenario: ValidationPipelineScenario,
): Promise<void> {
  await assertProperty(
    arbitraryValidationAdditiveStageScenario(),
    async ({ addedStageName, insertionIndex, stageFailures }) => {
      const existingStages = validationPipelineStages.map((stage, index): ValidationStage => ({
        ...stage,
        failsPipeline: true,
        run: () =>
          Promise.resolve({
            exitCode: stageFailures[index]
              ? VALIDATION_PIPELINE_DATA.exitCodes.FAILURE
              : VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
            output: stageFailures[index]
              ? stage.name
              : formatValidationNoProblemsMessage(stage.name),
          }),
      }));
      const base = await allCommand(
        { cwd: VALIDATION_ROOT },
        { stages: existingStages },
      );
      const addedStage: ValidationStage = {
        name: addedStageName,
        failsPipeline: true,
        participation: validationParticipationPolicy(VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT),
        run: () =>
          Promise.resolve({
            exitCode: VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
            output: formatValidationNoProblemsMessage(addedStageName),
          }),
      };
      const extendedStages = [
        ...existingStages.slice(0, insertionIndex),
        addedStage,
        ...existingStages.slice(insertionIndex),
      ];
      const extended = await allCommand(
        { cwd: VALIDATION_ROOT },
        { stages: extendedStages },
      );

      const baseOutcomes = extractStepOutcomes(base.output);
      const extendedOutcomes = extractStepOutcomes(extended.output);
      for (const [index] of existingStages.entries()) {
        const baseStep = index + 1;
        const extendedStep = index < insertionIndex ? baseStep : baseStep + 1;
        const expectedOutcome = stageFailures[index]
          ? VALIDATION_PIPELINE_DATA.outcome.fail
          : VALIDATION_PIPELINE_DATA.outcome.pass;
        expect(baseOutcomes.get(baseStep)).toBe(expectedOutcome);
        expect(extendedOutcomes.get(extendedStep)).toBe(expectedOutcome);
      }
      expect(extendedOutcomes.get(insertionIndex + 1)).toBe(VALIDATION_PIPELINE_DATA.outcome.pass);
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
}

function validationParticipationPolicy(stageName: string): ValidationStage["participation"] {
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

function extractStepOutcomes(
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
