import { symlink } from "node:fs/promises";
import { basename, join } from "node:path";

import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";

import {
  formatValidationStageSkipJsonOutput,
  formatValidationStageSkipOutput,
  VALIDATION_COMMAND_OUTPUT,
} from "@/commands/validation";
import { VALIDATION_SUMMARY_STATUS } from "@/commands/validation/format";
import { formatValidationNoProblemsMessage } from "@/commands/validation/messages";
import type { AllValidationJsonOutput } from "@/commands/validation/types";
import { SPX_PROGRAM_NAME } from "@/interfaces/cli/program";
import { createValidationDomain } from "@/interfaces/cli/validation";
import {
  literalValidationCliOptions,
  VALIDATION_EMPTY_CLI_OPERAND,
  validationCliDefinition,
  validationCommonCliOptions,
  validationLiteralProblemKinds,
} from "@/interfaces/cli/validation-contract";
import { sanitizeCliArgument, SENTINEL_EMPTY } from "@/lib/sanitize-cli-argument";
import {
  VALIDATION_STAGE_PARTICIPATION,
  type ValidationStage,
  type ValidationStageContext,
} from "@/validation/languages/types";
import { validationPipelineStages } from "@/validation/registry";
import { VALIDATION_SCOPES } from "@/validation/types";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import {
  VALIDATION_CLI_GENERATOR,
  VALIDATION_PIPELINE_DATA,
  validationCliSuccessExitCodeUpperBound,
} from "@testing/generators/validation/validation";
import {
  createRecordingValidationDomain,
  expectedEscapedControlArgument,
  expectValidationDispatchFailureInvokesNoHandler,
  runValidationInProcess,
  runValidationSubprocess,
  VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
  validationCliEmptyOutput,
  validationCliOptionName,
  withEmptyValidationProject,
  withIsolatedPackagedValidationCli,
} from "@testing/harnesses/validation/cli";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const VALIDATION_CLI_TEMP_DIR_PREFIX = "spx-validation-cli-";

interface ValidationCliDeferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

interface ObservedValidationStageContext {
  readonly name: string;
  readonly context: ValidationStageContext;
}

function validationCliDeferred(): ValidationCliDeferred {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  if (resolvePromise === undefined) throw new Error("validation CLI deferred resolver was not initialized");
  return { promise, resolve: resolvePromise };
}

function controlledValidationStages(observedContexts: ObservedValidationStageContext[] = []): ValidationStage[] {
  return validationPipelineStages.map((stage): ValidationStage => ({
    ...stage,
    run: async (context) => {
      observedContexts.push({ name: stage.name, context });
      return {
        exitCode: VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
        output: formatValidationNoProblemsMessage(stage.name),
      };
    },
  }));
}

function overridableValidationStage(stages: readonly ValidationStage[]): ValidationStage {
  const stage = stages.find((candidate) => candidate.participation.override !== undefined);
  if (stage === undefined) throw new Error("validation registry has no overridable stage");
  return stage;
}

async function expectRegisteredSubcommandRuns(): Promise<void> {
  await withEmptyValidationProject(async (productDir) => {
    const recorder = createRecordingValidationDomain(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
    const result = await runValidationInProcess(
      [validationCliDefinition.subcommands.all.commandName],
      { domain: recorder.domain, processCwd: () => productDir },
    );

    expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
    expect(result.stdout).toContain(VALIDATION_COMMAND_OUTPUT.TYPESCRIPT_SUCCESS);
    expect(result.stderr).not.toContain(VALIDATION_COMMAND_OUTPUT.TYPESCRIPT_SUCCESS);
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]?.commandName).toBe(validationCliDefinition.subcommands.all.commandName);
    expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
  });
}

async function expectRegisteredSubcommandPropagatesNonZeroExit(): Promise<void> {
  await withEmptyValidationProject(async (productDir) => {
    const recorder = createRecordingValidationDomain(VALIDATION_PIPELINE_DATA.exitCodes.FAILURE);
    const result = await runValidationInProcess(
      [validationCliDefinition.subcommands.all.commandName],
      { domain: recorder.domain, processCwd: () => productDir },
    );

    expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.FAILURE);
    expect(result.stderr).toContain(VALIDATION_COMMAND_OUTPUT.TYPESCRIPT_SUCCESS);
    expect(result.stdout).not.toContain(VALIDATION_COMMAND_OUTPUT.TYPESCRIPT_SUCCESS);
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]?.commandName).toBe(validationCliDefinition.subcommands.all.commandName);
    expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
  });
}

async function expectStreamedProgressSurvivesLaterFailure(): Promise<void> {
  const laterStageStarted = validationCliDeferred();
  const releaseLaterStage = validationCliDeferred();
  const streamedOutput: string[] = [];
  const stages: readonly ValidationStage[] = [
    {
      name: VALIDATION_PIPELINE_DATA.stageNames.ESLINT,
      failsPipeline: true,
      participation: { default: VALIDATION_STAGE_PARTICIPATION.RUN },
      run: async () => ({
        exitCode: VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
        output: formatValidationNoProblemsMessage(VALIDATION_PIPELINE_DATA.stageNames.ESLINT),
      }),
    },
    {
      name: VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT,
      failsPipeline: true,
      participation: { default: VALIDATION_STAGE_PARTICIPATION.RUN },
      run: async () => {
        laterStageStarted.resolve();
        await releaseLaterStage.promise;
        return {
          exitCode: VALIDATION_PIPELINE_DATA.exitCodes.FAILURE,
          output: VALIDATION_COMMAND_OUTPUT.TYPESCRIPT_FAILURE,
        };
      },
    },
  ];
  const run = runValidationInProcess(
    [validationCliDefinition.subcommands.all.commandName],
    {
      domain: createValidationDomain({ validationStages: stages }),
      writeStdout: (output) => streamedOutput.push(output),
    },
  );
  await laterStageStarted.promise;
  expect(streamedOutput.join(VALIDATION_EMPTY_CLI_OPERAND)).toContain(VALIDATION_PIPELINE_DATA.stageNames.ESLINT);
  releaseLaterStage.resolve();

  const result = await run;

  expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.FAILURE);
  expect(result.stdout).toContain(VALIDATION_PIPELINE_DATA.stageNames.ESLINT);
  expect(result.stderr).toContain(VALIDATION_SUMMARY_STATUS.FAILED);
}

async function expectPackagedCircularSubcommandRoutes(): Promise<void> {
  await withIsolatedPackagedValidationCli(async ({ executablePath }) => {
    const result = await runValidationSubprocess(
      [validationCliDefinition.subcommands.circular.commandName],
      { executablePath, timeout: VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT },
    );

    expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
    expect(result.stdout).toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND);
    expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
  });
}

async function expectOverrideProducesHumanSkipOutput(): Promise<void> {
  const observedContexts: ObservedValidationStageContext[] = [];
  const stages = controlledValidationStages(observedContexts);
  const overriddenStage = overridableValidationStage(stages);
  const override = overriddenStage.participation.override;
  if (override === undefined) throw new Error("selected validation stage has no override");

  const result = await runValidationInProcess(
    [validationCliDefinition.subcommands.all.commandName, override.flag],
    { domain: createValidationDomain({ validationStages: stages }) },
  );

  expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
  expect(result.stdout).toContain(formatValidationStageSkipOutput(overriddenStage.name, override.flag));
  expect(observedContexts.map(({ name }) => name)).toEqual(
    stages.filter((stage) => stage.name !== overriddenStage.name).map((stage) => stage.name),
  );
  for (const stage of stages.filter((candidate) => candidate.name !== overriddenStage.name)) {
    expect(result.stdout).toContain(formatValidationNoProblemsMessage(stage.name));
  }

  const quietResult = await runValidationInProcess(
    [validationCliDefinition.subcommands.all.commandName, override.flag, validationCommonCliOptions.quiet.flag],
    { domain: createValidationDomain({ validationStages: controlledValidationStages() }) },
  );
  expect(quietResult.stdout).not.toContain(formatValidationStageSkipOutput(overriddenStage.name, override.flag));
}

async function expectOverrideProducesJsonSkipSentinel(): Promise<void> {
  const stages = controlledValidationStages();
  const overriddenStage = overridableValidationStage(stages);
  const override = overriddenStage.participation.override;
  if (override === undefined) throw new Error("selected validation stage has no override");

  const result = await runValidationInProcess(
    [
      validationCliDefinition.subcommands.all.commandName,
      override.flag,
      validationCommonCliOptions.json.flag,
    ],
    { domain: createValidationDomain({ validationStages: stages }) },
  );
  const output = JSON.parse(result.stdout) as AllValidationJsonOutput;
  const skipped = output.steps.find((step) => step.name === overriddenStage.name);

  expect(result.stderr).toBe(validationCliEmptyOutput());
  expect(skipped?.output).toEqual(
    JSON.parse(formatValidationStageSkipJsonOutput(override.reason, skipped?.durationMs ?? 0)),
  );
}

async function expectJsonPipelineIsOneDocument(): Promise<void> {
  const result = await runValidationInProcess(
    [validationCliDefinition.subcommands.all.commandName, validationCommonCliOptions.json.flag],
    { domain: createValidationDomain({ validationStages: controlledValidationStages() }) },
  );
  const output = JSON.parse(result.stdout) as AllValidationJsonOutput;

  expect(result.stderr).toBe(validationCliEmptyOutput());
  expect(output.steps).toHaveLength(validationPipelineStages.length);
  expect(output.steps.map((step) => step.name)).toEqual(validationPipelineStages.map((stage) => stage.name));
}

async function expectProductionOverridePreservesOtherDefaults(): Promise<void> {
  const observedContexts: ObservedValidationStageContext[] = [];
  const stages = controlledValidationStages(observedContexts);
  const overriddenStage = overridableValidationStage(stages);
  const override = overriddenStage.participation.override;
  if (override === undefined) throw new Error("selected validation stage has no override");

  const result = await runValidationInProcess(
    [
      validationCliDefinition.subcommands.all.commandName,
      validationCommonCliOptions.scope.flag,
      VALIDATION_SCOPES.PRODUCTION,
      override.flag,
    ],
    { domain: createValidationDomain({ validationStages: stages }) },
  );

  expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
  expect(observedContexts).toHaveLength(stages.length - 1);
  expect(observedContexts.map(({ name }) => name)).toEqual(
    stages.filter((stage) => stage.name !== overriddenStage.name).map((stage) => stage.name),
  );
  expect(observedContexts.every(({ context }) => context.scope === VALIDATION_SCOPES.PRODUCTION)).toBe(true);
}

async function expectSubcommandHelpMatchesSupportedOptions(): Promise<void> {
  for (const definition of Object.values(validationCliDefinition.subcommands)) {
    const result = await runValidationInProcess([
      definition.commandName,
      validationCliDefinition.commanderHelpOperands.longFlag,
    ]);

    expect(result.stdout).toContain(validationCommonCliOptions.quiet.flag);
    if (definition.options.scope) {
      expect(result.stdout).toContain(validationCommonCliOptions.scope.flag);
    } else {
      expect(result.stdout).not.toContain(validationCommonCliOptions.scope.flag);
    }
    if (definition.options.json) {
      expect(result.stdout).toContain(validationCommonCliOptions.json.flag);
    } else {
      expect(result.stdout).not.toContain(validationCommonCliOptions.json.flag);
    }
  }
}

async function expectInvalidLiteralKindRejectedBeforeHandler(): Promise<void> {
  await withEmptyValidationProject(async (productDir) => {
    const unsafeKind = sampleLiteralTestValue(
      VALIDATION_CLI_GENERATOR.sanitizationSensitiveInvalidLiteralProblemKind(),
    );
    const result = await runValidationSubprocess(
      [
        validationCliDefinition.subcommands.literal.commandName,
        validationCliOptionName(literalValidationCliOptions.kind),
        unsafeKind,
      ],
      { cwd: productDir },
    );

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownLiteralProblemKind.exitCode);
    const recordedResult = await expectValidationDispatchFailureInvokesNoHandler(
      [
        validationCliDefinition.subcommands.literal.commandName,
        validationCliOptionName(literalValidationCliOptions.kind),
        unsafeKind,
      ],
      { processCwd: () => productDir },
    );
    expect(recordedResult.exitCode).toBe(validationCliDefinition.diagnostics.unknownLiteralProblemKind.exitCode);
    expect(result.stderr).toContain(validationCliDefinition.diagnostics.unknownLiteralProblemKind.messageLabel);
    expect(result.stderr).toContain(expectedEscapedControlArgument(unsafeKind));
    expect(result.stderr).not.toContain(unsafeKind);
    expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
  });
}

async function expectEscapingPathOperandsRejected(): Promise<void> {
  await withEmptyValidationProject(async (productDir) => {
    const result = await runValidationSubprocess(
      [
        validationCliDefinition.subcommands.format.commandName,
        VALIDATION_PIPELINE_DATA.escapingPathOperand,
      ],
      { cwd: productDir },
    );

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.invalidPathOperand.exitCode);
    expect(result.stdout).toBe(validationCliEmptyOutput());
    expect(result.stderr).toContain(validationCliDefinition.diagnostics.invalidPathOperand.messageLabel);
    expect(result.stderr).toContain(sanitizeCliArgument(VALIDATION_PIPELINE_DATA.escapingPathOperand));
    expect(result.stderr).toContain(validationCliDefinition.diagnostics.invalidPathOperand.reason);
    expect(result.stderr).not.toContain(VALIDATION_COMMAND_OUTPUT.FORMATTING_NO_ISSUES);
    await expectValidationDispatchFailureInvokesNoHandler(
      [
        validationCliDefinition.subcommands.format.commandName,
        VALIDATION_PIPELINE_DATA.escapingPathOperand,
      ],
      { processCwd: () => productDir },
    );
  });
}

async function expectSymlinkedInvocationDirectoryResolvesInProductOperand(): Promise<void> {
  await withTempDir(VALIDATION_CLI_TEMP_DIR_PREFIX, async (invocationContainer) => {
    await withEmptyValidationProject(async (productDir) => {
      const symlinkRoot = join(invocationContainer, basename(productDir));
      const operand = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
      await symlink(productDir, symlinkRoot, "dir");

      const result = await runValidationSubprocess(
        [
          validationCliDefinition.subcommands.format.commandName,
          operand,
        ],
        { cwd: symlinkRoot },
      );

      expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
      expect(result.stdout.length).toBeGreaterThan(VALIDATION_EMPTY_CLI_OPERAND.length);
      expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.invalidPathOperand.messageLabel);
      expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.invalidPathOperand.reason);
    });
  });
}

async function expectMissingPathBelowEscapingSymlinkAncestorRejected(): Promise<void> {
  await withTempDir(VALIDATION_CLI_TEMP_DIR_PREFIX, async (outsideRoot) => {
    await withEmptyValidationProject(async (productDir) => {
      const symlinkName = sampleLiteralTestValue(arbitraryPathSegment());
      const symlinkRoot = join(productDir, symlinkName);
      const operand = join(symlinkName, sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath()));

      await symlink(outsideRoot, symlinkRoot, "dir");

      const result = await runValidationSubprocess(
        [
          validationCliDefinition.subcommands.format.commandName,
          operand,
        ],
        { cwd: productDir },
      );

      expect(result.exitCode).toBe(validationCliDefinition.diagnostics.invalidPathOperand.exitCode);
      expect(result.stdout).toBe(validationCliEmptyOutput());
      expect(result.stderr).toContain(validationCliDefinition.diagnostics.invalidPathOperand.messageLabel);
      expect(result.stderr).toContain(sanitizeCliArgument(operand));
      expect(result.stderr).toContain(validationCliDefinition.diagnostics.invalidPathOperand.reason);
      expect(result.stderr).not.toContain(VALIDATION_COMMAND_OUTPUT.FORMATTING_NO_ISSUES);
      await expectValidationDispatchFailureInvokesNoHandler(
        [
          validationCliDefinition.subcommands.format.commandName,
          operand,
        ],
        { processCwd: () => productDir },
      );
    });
  });
}

async function expectUnknownSubcommandDiagnostic(): Promise<void> {
  const unknownStage = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.unknownSubcommand());
  const result = await runValidationSubprocess([unknownStage]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  await expectValidationDispatchFailureInvokesNoHandler([unknownStage]);
  expect(result.stderr).toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
  expect(result.stderr).toContain(unknownStage);
}

async function expectEmptyArgumentDiagnostic(): Promise<void> {
  const result = await runValidationSubprocess([
    VALIDATION_EMPTY_CLI_OPERAND,
  ]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  await expectValidationDispatchFailureInvokesNoHandler([
    VALIDATION_EMPTY_CLI_OPERAND,
  ]);
  expect(result.stderr).toContain(SENTINEL_EMPTY);
}

async function expectControlCharactersEscaped(): Promise<void> {
  const unsafeArgument = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.controlArgument());
  const result = await runValidationSubprocess([unsafeArgument]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  await expectValidationDispatchFailureInvokesNoHandler([unsafeArgument]);
  expect(result.stderr).toBe(
    `${SPX_PROGRAM_NAME} ${validationCliDefinition.domain.commandName}: ${validationCliDefinition.diagnostics.unknownSubcommand.messageLabel}: ${
      expectedEscapedControlArgument(unsafeArgument)
    }`,
  );
  expect(result.stderr).toContain(expectedEscapedControlArgument(unsafeArgument));
  expect(result.stderr).not.toContain(unsafeArgument);
}

async function expectUnicodeArgumentsPreserved(): Promise<void> {
  const unicodeArgument = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.unicodeArgument());
  const result = await runValidationSubprocess([unicodeArgument]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  await expectValidationDispatchFailureInvokesNoHandler([unicodeArgument]);
  expect(result.stderr).toContain(unicodeArgument);
}

async function expectOverlengthArgumentsTruncated(): Promise<void> {
  const overlengthArgument = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.overlengthPrintableSubcommand());
  const result = await runValidationSubprocess([overlengthArgument]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  await expectValidationDispatchFailureInvokesNoHandler([overlengthArgument]);
  expect(result.stderr).toContain(sanitizeCliArgument(overlengthArgument));
  expect(result.stderr).not.toContain(overlengthArgument);
}

async function expectLiteralHelpListsLiteralFlags(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.literal.commandName,
    validationCliDefinition.commanderHelpOperands.longFlag,
  ]);

  expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(result.stderr).toHaveLength(VALIDATION_EMPTY_CLI_OPERAND.length);
  expect(result.stdout).toContain(literalValidationCliOptions.allowlistExisting.flag);
  expect(result.stdout).toContain(literalValidationCliOptions.kind.flag);
  expect(result.stdout).toContain(literalValidationCliOptions.filesWithProblems.flag);
  expect(result.stdout).toContain(literalValidationCliOptions.literals.flag);
  expect(result.stdout).toContain(literalValidationCliOptions.verbose.flag);
  expect(result.stdout).toContain(validationCliDefinition.pathOperands.optionalVariadic);
  for (const problemKind of validationLiteralProblemKinds) {
    expect(result.stdout).toContain(problemKind);
  }
}

async function expectValidationAllHelpListsSkipFlags(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.all.commandName,
    validationCliDefinition.commanderHelpOperands.longFlag,
  ]);

  expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(result.stderr).toHaveLength(VALIDATION_EMPTY_CLI_OPERAND.length);
  for (const stage of validationPipelineStages) {
    if (stage.participation.override !== undefined) {
      expect(result.stdout).toContain(stage.participation.override.flag);
    }
  }
}

async function expectFullPipelineOverridesScopedToAllCommand(): Promise<void> {
  const overrides = validationPipelineStages.flatMap((stage) =>
    stage.participation.override === undefined ? [] : [stage.participation.override]
  );
  for (const definition of Object.values(validationCliDefinition.subcommands)) {
    if (definition.commandName === validationCliDefinition.subcommands.all.commandName) continue;
    for (const override of overrides) {
      const result = await runValidationInProcess([definition.commandName, override.flag]);
      expect(result.exitCode).not.toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
      expect(result.stderr).toContain(override.flag);
    }
  }
}

async function expectLiteralHelpOmitsSkipFlags(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.literal.commandName,
    validationCliDefinition.commanderHelpOperands.longFlag,
  ]);

  expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(result.stderr).toHaveLength(VALIDATION_EMPTY_CLI_OPERAND.length);
  expect(result.stdout).not.toContain(VALIDATION_PIPELINE_DATA.skipCircularFlag);
  expect(result.stdout).not.toContain(VALIDATION_PIPELINE_DATA.skipLiteralFlag);
}

async function expectLiteralCommandRejectsLiteralSkipFlag(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.literal.commandName,
    VALIDATION_PIPELINE_DATA.skipLiteralFlag,
  ]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  expect(result.stdout).toBe(validationCliEmptyOutput());
  expect(result.stderr).toContain(VALIDATION_PIPELINE_DATA.skipLiteralFlag);
}

async function expectCircularCommandRejectsCircularSkipFlag(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.circular.commandName,
    VALIDATION_PIPELINE_DATA.skipCircularFlag,
  ]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  expect(result.stdout).toBe(validationCliEmptyOutput());
  expect(result.stderr).toContain(VALIDATION_PIPELINE_DATA.skipCircularFlag);
}

async function expectUnknownOptionInvokesNoHandler(): Promise<void> {
  const unknownOption = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.unknownOption());
  const result = await expectValidationDispatchFailureInvokesNoHandler([unknownOption]);

  expect(result.exitCode).not.toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(result.stderr).toContain(unknownOption);
}

async function expectTypedSubcommandRegistryIsExhaustivelyRegistered(): Promise<void> {
  for (const definition of Object.values(validationCliDefinition.subcommands)) {
    const operands = definition.alias === undefined
      ? [definition.commandName]
      : [definition.commandName, definition.alias];
    for (const operand of operands) {
      const recorder = createRecordingValidationDomain(
        validationCliDefinition.diagnostics.unknownLiteralProblemKind.exitCode,
      );
      const result = await runValidationInProcess([operand], { domain: recorder.domain });
      expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownLiteralProblemKind.exitCode);
      expect(recorder.calls).toHaveLength(1);
      expect(recorder.calls[0]?.commandName).toBe(definition.commandName);
    }
  }
}

export function registerValidationCliScenarioTests(): void {
  describe("spx validation dispatch — observable scenarios", () => {
    it(
      "registered subcommand runs its handler without dispatch failure",
      expectRegisteredSubcommandRuns,
      VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
    );
    it(
      "registered subcommand propagates a non-zero handler exit code",
      expectRegisteredSubcommandPropagatesNonZeroExit,
      VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
    );
    it("streamed progress remains on stdout when a later stage fails", expectStreamedProgressSurvivesLaterFailure);
    it(
      "packaged executable routes the circular subcommand",
      expectPackagedCircularSubcommandRoutes,
      VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
    );
    it("full-pipeline override emits human skip output", expectOverrideProducesHumanSkipOutput);
    it("full-pipeline JSON override emits a skipped sentinel", expectOverrideProducesJsonSkipSentinel);
    it("full-pipeline JSON output is one aggregate document", expectJsonPipelineIsOneDocument);
    it("production-scope override preserves other descriptor defaults", expectProductionOverridePreservesOtherDefaults);
    it("subcommand help exposes only supported options", expectSubcommandHelpMatchesSupportedOptions);
    it(
      "typed subcommand registry is exhaustively registered with the dispatcher",
      expectTypedSubcommandRegistryIsExhaustivelyRegistered,
    );
    it(
      "path operands that escape the product directory are rejected before validation runs",
      expectEscapingPathOperandsRejected,
    );
    it(
      "non-existent in-product path operands resolve from a symlinked invocation directory",
      expectSymlinkedInvocationDirectoryResolvesInProductOperand,
    );
    it(
      "non-existent path operands below symlink ancestors that escape the product are rejected",
      expectMissingPathBelowEscapingSymlinkAncestorRejected,
    );
    it("unknown subcommand reaches the sanitized diagnostic path", expectUnknownSubcommandDiagnostic);
    it("empty argument reports the empty-value sentinel", expectEmptyArgumentDiagnostic);
    it("ASCII control characters are escaped before reaching stderr", expectControlCharactersEscaped);
    it("multi-byte Unicode arguments are preserved in stderr", expectUnicodeArgumentsPreserved);
    it("overlength printable arguments are truncated in stderr", expectOverlengthArgumentsTruncated);
    it("literal help lists literal flags and valid problem kinds", expectLiteralHelpListsLiteralFlags);
    it("validation all help lists full-pipeline skip flags", expectValidationAllHelpListsSkipFlags);
    it(
      "full-pipeline overrides are rejected by every standalone subcommand",
      expectFullPipelineOverridesScopedToAllCommand,
    );
    it("literal help omits full-pipeline skip flags", expectLiteralHelpOmitsSkipFlags);
    it("literal command rejects the full-pipeline literal skip flag", expectLiteralCommandRejectsLiteralSkipFlag);
    it("circular command rejects the full-pipeline circular skip flag", expectCircularCommandRejectsCircularSkipFlag);
  });
}

export const validationCliScenarioCases = collectHarnessTestCases(registerValidationCliScenarioTests);

export function registerValidationCliComplianceTests(): void {
  describe("spx validation dispatch compliance", () => {
    it(
      "routes every typed registry subcommand to its intended handler",
      expectTypedSubcommandRegistryIsExhaustivelyRegistered,
    );
    it("emits a sanitized unknown-subcommand diagnostic without running a stage", expectUnknownSubcommandDiagnostic);
    it("escapes control characters in unknown-subcommand diagnostics", expectControlCharactersEscaped);
    it("rejects invalid literal kinds before literal detection", expectInvalidLiteralKindRejectedBeforeHandler);
    it("rejects escaping path operands without invoking a handler", expectEscapingPathOperandsRejected);
    it(
      "rejects paths below escaping symlink ancestors without invoking a handler",
      expectMissingPathBelowEscapingSymlinkAncestorRejected,
    );
    it("registers literal flags and valid problem kinds", expectLiteralHelpListsLiteralFlags);
    it("registers validation-all skip flags", expectValidationAllHelpListsSkipFlags);
    it("scopes every descriptor-derived override to validation all", expectFullPipelineOverridesScopedToAllCommand);
    it("keeps literal skip scoped away from the literal command", expectLiteralCommandRejectsLiteralSkipFlag);
    it("keeps circular skip scoped away from the circular command", expectCircularCommandRejectsCircularSkipFlag);
    it("rejects unknown options without invoking a handler", expectUnknownOptionInvokesNoHandler);
  });
}

export const validationCliComplianceCases = collectHarnessTestCases(registerValidationCliComplianceTests);
