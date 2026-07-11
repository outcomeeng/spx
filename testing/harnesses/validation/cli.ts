import { CommanderError } from "commander";
import { execa } from "execa";
import { symlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { expect, it } from "vitest";

import {
  formatValidationStageSkipOutput,
  LITERAL_PROBLEM_KIND,
  VALIDATION_COMMAND_OUTPUT,
} from "@/commands/validation";
import { VALIDATION_SUMMARY_STATUS, VALIDATION_SYMBOLS } from "@/commands/validation/format";
import type { Domain } from "@/domains/types";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import {
  createValidationDomain,
  literalValidationCliOptions,
  validationCliDefinition,
  type ValidationCommandHandlers,
  validationCommonCliOptions,
  validationDomain,
  validationOptionPrefix,
} from "@/interfaces/cli/validation";
import { sanitizeCliArgument, SENTINEL_EMPTY } from "@/lib/sanitize-cli-argument";
import { VALIDATION_STAGE_PARTICIPATION, type ValidationStage } from "@/validation/languages/types";
import { validationPipelineStages } from "@/validation/registry";
import { VALIDATION_SCOPES, type ValidationScope } from "@/validation/types";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import {
  VALIDATION_CLI_GENERATOR,
  VALIDATION_PIPELINE_DATA,
  validationCliEmptyOutputLength,
  validationCliOptionOperandSeparator,
  validationCliPackagedExecutablePath,
  validationCliSuccessExitCodeUpperBound,
  validationCliTempDirectoryPrefix,
  validationCliUnavailableExitCode,
  type ValidationSubprocessScenario,
} from "@testing/generators/validation/validation";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

const SYNTHETIC_OVERRIDE_STAGE_NAME = "Synthetic override stage";
const SYNTHETIC_DEFAULT_STAGE_NAME = "Synthetic default stage";
const SYNTHETIC_FAILURE_STAGE_NAME = "Synthetic failure stage";
const SYNTHETIC_OVERRIDE_FLAG = "--synthetic-override-stage";
const SYNTHETIC_OVERRIDE_DESCRIPTION = "Synthetic override stage flag";
const SYNTHETIC_OVERRIDE_REASON = "synthetic-override-stage";
const OBSERVED_HANDLER_OUTPUT_PREFIX = "validation-handler-called:";
const OBSERVED_HANDLER_EXIT_CODE = 7;

export interface ValidationCliResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

export interface ValidationCliRunOptions {
  readonly cwd?: string;
  readonly timeout?: number;
}

export interface ValidationCliOptionDefinition {
  readonly flag: string;
}

export interface ValidationCliStreamingObservation {
  readonly result: ValidationCliResult;
  readonly observedStageOutputBeforeExit: boolean;
  readonly observedStageOutputWhileProcessRemainedActive: boolean;
}

export interface ValidationCliInProcessOptions {
  readonly processCwd?: () => string;
  readonly onStdout?: (output: string) => void;
}

interface ObservedValidationCommandCall {
  readonly commandName: string;
  readonly files?: readonly string[];
  readonly scope?: ValidationScope;
}

interface ObservedValidationCommandHandlers {
  readonly calls: readonly ObservedValidationCommandCall[];
  readonly commandHandlers: Partial<ValidationCommandHandlers>;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
}

export async function runValidationSubprocess(
  args: readonly string[],
  options: ValidationCliRunOptions = {},
): Promise<ValidationCliResult> {
  const result = await execa(process.execPath, validationCliPackagedArgs(args), {
    cwd: options.cwd,
    reject: false,
    timeout: options.timeout ?? sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.subprocessTimeout()),
  });
  return {
    exitCode: result.exitCode ?? validationCliUnavailableExitCode(),
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

export async function runValidationSubprocessObservingStreaming(
  args: readonly string[],
  options: ValidationCliRunOptions = {},
): Promise<ValidationCliStreamingObservation> {
  let processExited = false;
  let observedStageOutputBeforeExit = false;
  let observedStageOutputWhileProcessRemainedActive = false;
  let stdout = validationCliEmptyOutput();
  let stderr = validationCliEmptyOutput();
  let resolveObservation: () => void = () => undefined;
  let observationScheduled = false;
  const observation = new Promise<void>((resolve) => {
    resolveObservation = resolve;
  });
  const subprocess = execa(process.execPath, validationCliPackagedArgs(args), {
    cwd: options.cwd,
    reject: false,
    timeout: options.timeout ?? sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.subprocessTimeout()),
  });

  subprocess.stdout.on("data", (chunk: Buffer) => {
    const output = chunk.toString();
    stdout += output;
    if (!processExited && outputContainsValidationStageMarker(output)) {
      observedStageOutputBeforeExit = true;
      if (!observationScheduled) {
        observationScheduled = true;
        setTimeout(() => {
          observedStageOutputWhileProcessRemainedActive = subprocess.exitCode === null;
          resolveObservation();
        }, VALIDATION_PIPELINE_DATA.streamingObservationDelayMs);
      }
    }
  });
  subprocess.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const resultPromise = subprocess.then((result) => {
    processExited = true;
    resolveObservation();
    return result;
  });
  const [result] = await Promise.all([resultPromise, observation]);

  return {
    observedStageOutputBeforeExit,
    observedStageOutputWhileProcessRemainedActive,
    result: {
      exitCode: result.exitCode ?? validationCliUnavailableExitCode(),
      stderr,
      stdout,
    },
  };
}

export async function runValidationInProcess(
  args: readonly string[],
  options: ValidationCliInProcessOptions = {},
): Promise<ValidationCliResult> {
  return runValidationInProcessWithDomains(args, [validationDomain], options);
}

export async function runValidationInProcessWithDomains(
  args: readonly string[],
  domains: readonly Domain[],
  options: ValidationCliInProcessOptions = {},
): Promise<ValidationCliResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const program = createCliProgram({
    domains,
    processCwd: options.processCwd,
    writeStdout: (output) => {
      stdout.push(output);
      options.onStdout?.(output);
    },
    writeStderr: (output) => stderr.push(output),
    setExitCode: () => undefined,
    exit: (exitCode) => {
      throw new CommanderError(
        exitCode,
        validationCliDefinition.domain.commandName,
        validationCliEmptyOutput(),
      );
    },
  });

  program.exitOverride();
  program.configureOutput({
    writeErr: (value) => stderr.push(value),
    writeOut: (value) => stdout.push(value),
  });

  try {
    await program.parseAsync(
      [validationCliDefinition.domain.commandName, ...args],
      { from: SPX_COMMANDER_PARSE_SOURCE },
    );
    return {
      exitCode: validationCliEmptyOutputLength(),
      stderr: stderr.join(validationCliEmptyOutput()),
      stdout: stdout.join(validationCliEmptyOutput()),
    };
  } catch (error) {
    const exitCode = commanderExitCode(error);
    if (exitCode !== undefined) {
      return {
        exitCode,
        stderr: stderr.join(validationCliEmptyOutput()),
        stdout: stdout.join(validationCliEmptyOutput()),
      };
    }
    throw error;
  }
}

export function withEmptyValidationProject(
  testFn: (projectRoot: string) => Promise<void>,
): Promise<void> {
  return withTempDir(validationCliTempDirectoryPrefix(), testFn);
}

export function validationCliPackagedArgs(args: readonly string[]): string[] {
  return [validationCliPackagedExecutablePath(), validationCliDefinition.domain.commandName, ...args];
}

export function validationCliOptionName(option: ValidationCliOptionDefinition): string {
  const name = option.flag.split(validationCliOptionOperandSeparator()).at(0);
  return name ?? option.flag;
}

export function validationCliEmptyOutput(): string {
  return validationCliDefinition.domain.commandName.slice(
    validationCliEmptyOutputLength(),
    validationCliEmptyOutputLength(),
  );
}

export function expectValidationSubprocessResult(
  result: ValidationCliResult,
  scenario: ValidationSubprocessScenario,
): void {
  const combinedOutput = `${result.stdout}${result.stderr}`;

  if (scenario.expectedExitCode !== undefined) {
    expect(result.exitCode).toBe(scenario.expectedExitCode);
  }
  if (scenario.unexpectedExitCode !== undefined) {
    expect(result.exitCode).not.toBe(scenario.unexpectedExitCode);
  }

  for (const marker of scenario.stdoutIncludes) {
    expect(result.stdout).toContain(marker);
  }
  for (const marker of scenario.combinedIncludes) {
    expect(combinedOutput).toContain(marker);
  }
  for (const marker of scenario.stdoutExcludes) {
    expect(result.stdout).not.toContain(marker);
  }
  for (const marker of scenario.stderrExcludes) {
    expect(result.stderr).not.toContain(marker);
  }
  for (const marker of scenario.combinedExcludes) {
    expect(combinedOutput).not.toContain(marker);
  }
}

export async function expectRegisteredSubcommandRunsHandlerWithoutDispatchFailure(): Promise<void> {
  await withEmptyValidationProject(async (projectRoot) => {
    for (const { operand, commandName } of validationRegisteredSubcommandOperands()) {
      const observed = observedValidationCommandHandlers();
      const result = await runValidationInProcessWithDomains(
        [operand],
        [createValidationDomain({ commandHandlers: observed.commandHandlers })],
        { processCwd: () => projectRoot },
      );

      expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
      expect(result.stdout).toContain(observedHandlerOutput(commandName));
      expect(observed.calls.map((call) => call.commandName)).toEqual([commandName]);
      expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
    }
  });
}

export async function expectRegisteredSubcommandPropagatesNonZeroExitCode(): Promise<void> {
  await withEmptyValidationProject(async (projectRoot) => {
    const observed = observedValidationCommandHandlers(OBSERVED_HANDLER_EXIT_CODE);
    const result = await runValidationInProcessWithDomains(
      [validationCliDefinition.subcommands.format.commandName],
      [createValidationDomain({ commandHandlers: observed.commandHandlers })],
      { processCwd: () => projectRoot },
    );

    expect(result.exitCode).toBe(OBSERVED_HANDLER_EXIT_CODE);
    expect(result.stderr).toContain(observedHandlerOutput(validationCliDefinition.subcommands.format.commandName));
    expect(result.stdout).not.toContain(observedHandlerOutput(validationCliDefinition.subcommands.format.commandName));
    expect(observed.calls).toEqual([{ commandName: validationCliDefinition.subcommands.format.commandName }]);
  });
}

export async function expectFullPipelineStreamsProgressBeforeFailureSummary(): Promise<void> {
  const failureStarted = createDeferred<void>();
  const releaseFailure = createDeferred<void>();
  let observedProgressBeforeFailureCompleted = false;
  const resultPromise = runValidationInProcessWithDomains(
    [validationCliDefinition.subcommands.all.commandName],
    [createValidationDomain({
      validationStages: [
        syntheticDefaultStage([]),
        syntheticControlledFailureStage(failureStarted.resolve, releaseFailure.promise),
      ],
    })],
    {
      onStdout: (output) => {
        if (output.includes(observedHandlerOutput(SYNTHETIC_DEFAULT_STAGE_NAME))) {
          observedProgressBeforeFailureCompleted = true;
        }
      },
    },
  );
  await failureStarted.promise;
  expect(observedProgressBeforeFailureCompleted).toBe(true);
  releaseFailure.resolve();
  const result = await resultPromise;

  expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.FAILURE);
  expect(result.stdout).toContain(observedHandlerOutput(SYNTHETIC_DEFAULT_STAGE_NAME));
  expect(result.stdout).toContain(observedHandlerOutput(SYNTHETIC_FAILURE_STAGE_NAME));
  expect(result.stderr).toContain(`${VALIDATION_SYMBOLS.FAILURE} Validation ${VALIDATION_SUMMARY_STATUS.FAILED}`);
  expect(result.stderr).not.toContain(observedHandlerOutput(SYNTHETIC_DEFAULT_STAGE_NAME));
  expect(result.stderr).not.toContain(observedHandlerOutput(SYNTHETIC_FAILURE_STAGE_NAME));
}

function createDeferred<T>(): Deferred<T> {
  let resolve: Deferred<T>["resolve"] = () => undefined;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

export async function expectPackagedCircularSubcommandRoutesHandler(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const result = await runValidationSubprocess(
      [validationCliDefinition.subcommands.circular.commandName],
      { cwd: path },
    );

    expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
    expect(result.stdout).toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND);
    expect(result.stdout).not.toMatch(VALIDATION_PIPELINE_DATA.stepLinePattern);
    expect(result.stdout).not.toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
  });
}

export async function expectValidationAllForwardsProductionScope(): Promise<void> {
  await withEmptyValidationProject(async (projectRoot) => {
    const observed = observedValidationCommandHandlers();
    const result = await runValidationInProcessWithDomains(
      [
        validationCliDefinition.subcommands.all.commandName,
        validationCommonScopeFlag(),
        VALIDATION_PIPELINE_DATA.productionScope,
      ],
      [createValidationDomain({ commandHandlers: observed.commandHandlers })],
      { processCwd: () => projectRoot },
    );

    expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
    expect(observed.calls).toEqual([{
      commandName: validationCliDefinition.subcommands.all.commandName,
      scope: VALIDATION_PIPELINE_DATA.productionScope,
    }]);
  });
}

export async function expectValidationAllForwardsFileScope(): Promise<void> {
  await withEmptyValidationProject(async (projectRoot) => {
    const file = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    const observed = observedValidationCommandHandlers();
    const result = await runValidationInProcessWithDomains(
      [validationCliDefinition.subcommands.all.commandName, file],
      [createValidationDomain({ commandHandlers: observed.commandHandlers })],
      { processCwd: () => projectRoot },
    );

    expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
    expect(observed.calls).toEqual([{
      commandName: validationCliDefinition.subcommands.all.commandName,
      files: [file],
      scope: VALIDATION_SCOPES.FULL,
    }]);
  });
}

export async function expectLiteralCommandRejectsInvalidKindBeforeStageWork(): Promise<void> {
  await withEmptyValidationProject(async (projectRoot) => {
    const unsafeKind = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.invalidLiteralProblemKind());
    const result = await expectDispatchFailureSkipsInjectedHandlers({
      args: [
        validationCliDefinition.subcommands.literal.commandName,
        validationCliOptionName(literalValidationCliOptions.kind),
        unsafeKind,
      ],
      expectedLabel: validationCliDefinition.diagnostics.unknownLiteralProblemKind.messageLabel,
      expectedSanitizedArgument: sanitizeCliArgument(unsafeKind),
      projectRoot,
    });

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownLiteralProblemKind.exitCode);
    expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
  });
}

export async function expectPathEscapeRejectedBeforeValidation(): Promise<void> {
  await withEmptyValidationProject(async (productRoot) => {
    const result = await expectDispatchFailureSkipsInjectedHandlers({
      args: [
        validationCliDefinition.subcommands.format.commandName,
        VALIDATION_PIPELINE_DATA.escapingPathOperand,
      ],
      expectedLabel: validationCliDefinition.diagnostics.invalidPathOperand.messageLabel,
      expectedSanitizedArgument: sanitizeCliArgument(VALIDATION_PIPELINE_DATA.escapingPathOperand),
      projectRoot: productRoot,
    });

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.invalidPathOperand.exitCode);
    expect(result.stderr).toContain(validationCliDefinition.diagnostics.invalidPathOperand.reason);
  });
}

export async function expectSymlinkedInvocationDirectoryResolvesInProductOperand(): Promise<void> {
  await withEmptyValidationProject(async (productRoot) => {
    const symlinkRoot = join(dirname(productRoot), `${basename(productRoot)}-link`);
    const operand = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    const observed = observedValidationCommandHandlers();
    await symlink(productRoot, symlinkRoot, "dir");

    const result = await runValidationInProcessWithDomains(
      [
        validationCliDefinition.subcommands.format.commandName,
        operand,
      ],
      [createValidationDomain({ commandHandlers: observed.commandHandlers })],
      { processCwd: () => symlinkRoot },
    );

    expect(result.exitCode).not.toBe(validationCliDefinition.diagnostics.invalidPathOperand.exitCode);
    expect(result.stdout).toContain(observedHandlerOutput(validationCliDefinition.subcommands.format.commandName));
    expect(observed.calls).toEqual([{
      commandName: validationCliDefinition.subcommands.format.commandName,
      files: [operand],
    }]);
    expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.invalidPathOperand.messageLabel);
    expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.invalidPathOperand.reason);
  });
}

export async function expectUnknownSubcommandReachesSanitizedDiagnostic(): Promise<void> {
  const unknownStage = sampleLiteralTestValue(
    VALIDATION_CLI_GENERATOR.unknownSubcommand()
      .filter((candidate) => !candidate.startsWith(validationOptionPrefix)),
  );
  await withEmptyValidationProject(async (projectRoot) => {
    const result = await expectDispatchFailureSkipsInjectedHandlers({
      args: [unknownStage],
      expectedLabel: validationCliDefinition.diagnostics.unknownSubcommand.messageLabel,
      expectedSanitizedArgument: sanitizeCliArgument(unknownStage),
      projectRoot,
    });

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  });
}

export async function expectEmptyArgumentReportsSentinel(): Promise<void> {
  const emptyArgument = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.emptyArgument());
  await withEmptyValidationProject(async (projectRoot) => {
    const result = await expectDispatchFailureSkipsInjectedHandlers({
      args: [emptyArgument],
      expectedLabel: validationCliDefinition.diagnostics.unknownSubcommand.messageLabel,
      expectedSanitizedArgument: SENTINEL_EMPTY,
      projectRoot,
    });

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  });
}

export async function expectAsciiControlCharactersEscapedBeforeStderr(): Promise<void> {
  const unsafeArgument = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.controlArgument());
  await withEmptyValidationProject(async (projectRoot) => {
    const result = await expectDispatchFailureSkipsInjectedHandlers({
      args: [unsafeArgument],
      expectedLabel: validationCliDefinition.diagnostics.unknownSubcommand.messageLabel,
      expectedSanitizedArgument: expectedCliEscapedArgument(unsafeArgument),
      projectRoot,
    });

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
    expect(result.stderr).not.toContain(unsafeArgument);
  });
}

export async function expectMultiByteUnicodePreservedInStderr(): Promise<void> {
  const unicodeArgument = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.unicodeArgument());
  await withEmptyValidationProject(async (projectRoot) => {
    const result = await expectDispatchFailureSkipsInjectedHandlers({
      args: [unicodeArgument],
      expectedLabel: validationCliDefinition.diagnostics.unknownSubcommand.messageLabel,
      expectedSanitizedArgument: unicodeArgument,
      projectRoot,
    });

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  });
}

export function registerValidationCliDispatchPropertyTests(): void {
  it(
    "every unknown subcommand string reaches the unknown-subcommand diagnostic path",
    { timeout: sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.propertyOptions()).timeout },
    async () => {
      await withEmptyValidationProject(async (projectRoot) => {
        await assertProperty(
          VALIDATION_CLI_GENERATOR.unknownSubcommand(),
          async (candidate) => {
            const observed = observedValidationCommandHandlers();
            const result = await runValidationInProcessWithDomains(
              [candidate],
              [createValidationDomain({ commandHandlers: observed.commandHandlers })],
              { processCwd: () => projectRoot },
            );

            expect(result.exitCode).not.toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
            expect(result.stderr).toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
            expect(observed.calls).toEqual([]);
          },
          { level: PROPERTY_LEVEL.L2, size: PROPERTY_SIZE.SMALL },
        );
      });
    },
  );
}

export function registerValidationCliDispatchComplianceTests(): void {
  it("registered subcommands route through the registered handler set", async () => {
    await expectRegisteredSubcommandRunsHandlerWithoutDispatchFailure();
  });

  it(
    "dispatch failures do not enter injected validation handlers",
    async () => {
      await withEmptyValidationProject(async (projectRoot) => {
        const unknownSubcommand = sampleLiteralTestValue(
          VALIDATION_CLI_GENERATOR.unknownSubcommand()
            .filter((candidate) => !candidate.startsWith(validationOptionPrefix)),
        );
        const invalidKind = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.invalidLiteralProblemKind());
        await expectDispatchFailureSkipsInjectedHandlers({
          args: [unknownSubcommand],
          expectedLabel: validationCliDefinition.diagnostics.unknownSubcommand.messageLabel,
          expectedSanitizedArgument: sanitizeCliArgument(unknownSubcommand),
          projectRoot,
        });
        await expectDispatchFailureSkipsInjectedHandlers({
          args: [
            validationCliDefinition.subcommands.literal.commandName,
            validationCliOptionName(literalValidationCliOptions.kind),
            invalidKind,
          ],
          expectedLabel: validationCliDefinition.diagnostics.unknownLiteralProblemKind.messageLabel,
          expectedSanitizedArgument: sanitizeCliArgument(invalidKind),
          projectRoot,
        });
        await expectDispatchFailureSkipsInjectedHandlers({
          args: [
            validationCliDefinition.subcommands.format.commandName,
            VALIDATION_PIPELINE_DATA.escapingPathOperand,
          ],
          expectedLabel: validationCliDefinition.diagnostics.invalidPathOperand.messageLabel,
          expectedSanitizedArgument: sanitizeCliArgument(VALIDATION_PIPELINE_DATA.escapingPathOperand),
          projectRoot,
        });
      });
    },
  );

  it("literal and full-pipeline options are registered on the owning subcommands", async () => {
    await expectLiteralHelpListsLiteralFlagsAndProblemKinds();
    await expectValidationAllHelpListsOverrideFlags();
    await expectLiteralHelpOmitsValidationAllOverrideFlags();
    await expectStandaloneCommandsRejectFullPipelineOverrideFlags();
  });

  it("full-pipeline stage participation follows descriptor defaults and invocation overrides", async () => {
    await expectFullPipelineStageParticipationFollowsCliOverrides();
  });
}

export async function expectFullPipelineStageParticipationFollowsCliOverrides(): Promise<void> {
  const humanStages = syntheticOverrideStageSet();
  const humanResult = await runValidationInProcessWithDomains(
    [
      validationCliDefinition.subcommands.all.commandName,
      SYNTHETIC_OVERRIDE_FLAG,
    ],
    [createValidationDomain({
      validationStages: humanStages.stages,
    })],
  );
  const quietStages = syntheticOverrideStageSet();
  const quietResult = await runValidationInProcessWithDomains(
    [
      validationCliDefinition.subcommands.all.commandName,
      SYNTHETIC_OVERRIDE_FLAG,
      validationCommonCliOptions.quiet.flag,
    ],
    [createValidationDomain({
      validationStages: quietStages.stages,
    })],
  );
  const jsonStages = syntheticOverrideStageSet();
  const jsonResult = await runValidationInProcessWithDomains(
    [
      validationCliDefinition.subcommands.all.commandName,
      SYNTHETIC_OVERRIDE_FLAG,
      validationCommonJsonFlag(),
    ],
    [createValidationDomain({
      validationStages: jsonStages.stages,
    })],
  );
  const productionStages = syntheticOverrideStageSet();
  const productionResult = await runValidationInProcessWithDomains(
    [
      validationCliDefinition.subcommands.all.commandName,
      validationCommonScopeFlag(),
      VALIDATION_PIPELINE_DATA.productionScope,
      SYNTHETIC_OVERRIDE_FLAG,
    ],
    [createValidationDomain({
      validationStages: productionStages.stages,
    })],
  );

  expect(humanResult.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(humanResult.stdout).toContain(SYNTHETIC_OVERRIDE_REASON);
  expect(humanResult.stdout).not.toContain(observedHandlerOutput(SYNTHETIC_OVERRIDE_STAGE_NAME));
  expect(humanResult.stdout).toContain(observedHandlerOutput(SYNTHETIC_DEFAULT_STAGE_NAME));
  expect(humanStages.calls).toEqual([SYNTHETIC_DEFAULT_STAGE_NAME]);
  expect(quietResult.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(quietResult.stdout.trim()).toHaveLength(validationCliEmptyOutputLength());
  expect(quietStages.calls).toEqual([SYNTHETIC_DEFAULT_STAGE_NAME]);
  expect(jsonResult.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expectStructuredSkippedSentinel(jsonResult.stdout, SYNTHETIC_OVERRIDE_REASON);
  expect(jsonResult.stdout).not.toContain(
    formatValidationStageSkipOutput(SYNTHETIC_OVERRIDE_STAGE_NAME, SYNTHETIC_OVERRIDE_FLAG),
  );
  expect(jsonResult.stdout).not.toContain(observedHandlerOutput(SYNTHETIC_OVERRIDE_STAGE_NAME));
  expect(jsonResult.stdout).toContain(observedHandlerOutput(SYNTHETIC_DEFAULT_STAGE_NAME));
  expect(jsonStages.calls).toEqual([SYNTHETIC_DEFAULT_STAGE_NAME]);
  expect(productionResult.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(productionResult.stdout).toContain(SYNTHETIC_OVERRIDE_REASON);
  expect(productionResult.stdout).not.toContain(observedHandlerOutput(SYNTHETIC_OVERRIDE_STAGE_NAME));
  expect(productionResult.stdout).toContain(observedHandlerOutput(SYNTHETIC_DEFAULT_STAGE_NAME));
  expect(productionStages.calls).toEqual([SYNTHETIC_DEFAULT_STAGE_NAME]);
}

export async function expectLiteralHelpListsLiteralFlagsAndProblemKinds(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.literal.commandName,
    validationCliDefinition.commanderHelpOperands.longFlag,
  ]);

  expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(result.stderr).toHaveLength(validationCliEmptyOutputLength());
  expect(result.stdout).toContain(literalValidationCliOptions.allowlistExisting.flag);
  expect(result.stdout).toContain(literalValidationCliOptions.kind.flag);
  expect(result.stdout).toContain(literalValidationCliOptions.filesWithProblems.flag);
  expect(result.stdout).toContain(literalValidationCliOptions.literals.flag);
  expect(result.stdout).toContain(literalValidationCliOptions.verbose.flag);
  expect(result.stdout).toContain(validationCliDefinition.pathOperands.optionalVariadic);
  for (const kind of Object.values(LITERAL_PROBLEM_KIND)) {
    expect(result.stdout).toContain(kind);
  }
}

export async function expectValidationAllHelpListsOverrideFlags(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.all.commandName,
    validationCliDefinition.commanderHelpOperands.longFlag,
  ]);
  const syntheticResult = await runValidationInProcessWithDomains(
    [
      validationCliDefinition.subcommands.all.commandName,
      validationCliDefinition.commanderHelpOperands.longFlag,
    ],
    [createValidationDomain({
      validationStages: [syntheticOverrideStage()],
    })],
  );

  expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(result.stderr).toHaveLength(validationCliEmptyOutputLength());
  for (const flag of validationAllOverrideFlagsFromStageDescriptors()) {
    expect(result.stdout).toContain(flag);
  }
  expect(syntheticResult.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(syntheticResult.stderr).toHaveLength(validationCliEmptyOutputLength());
  expect(syntheticResult.stdout).toContain(SYNTHETIC_OVERRIDE_FLAG);
  expect(syntheticResult.stdout).toContain(SYNTHETIC_OVERRIDE_DESCRIPTION);
}

export async function expectLiteralHelpOmitsValidationAllOverrideFlags(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.literal.commandName,
    validationCliDefinition.commanderHelpOperands.longFlag,
  ]);
  const syntheticResult = await runValidationInProcessWithDomains(
    [
      validationCliDefinition.subcommands.literal.commandName,
      validationCliDefinition.commanderHelpOperands.longFlag,
    ],
    [createValidationDomain({
      validationStages: [syntheticOverrideStage()],
    })],
  );

  expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(result.stderr).toHaveLength(validationCliEmptyOutputLength());
  for (const flag of validationAllOverrideFlagsFromStageDescriptors()) {
    expect(result.stdout).not.toContain(flag);
  }
  expect(syntheticResult.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(syntheticResult.stderr).toHaveLength(validationCliEmptyOutputLength());
  expect(syntheticResult.stdout).not.toContain(SYNTHETIC_OVERRIDE_FLAG);
}

function validationAllOverrideFlagsFromStageDescriptors(): readonly `--${string}`[] {
  return validationPipelineStages
    .flatMap((stage) => {
      const override = stage.participation.override;
      if (override === undefined) return [];
      return [override.flag];
    });
}

async function expectDispatchFailureSkipsInjectedHandlers(options: {
  readonly args: readonly string[];
  readonly expectedLabel: string;
  readonly expectedSanitizedArgument: string;
  readonly projectRoot: string;
}): Promise<ValidationCliResult> {
  const observed = observedValidationCommandHandlers();
  const result = await runValidationInProcessWithDomains(
    options.args,
    [createValidationDomain({ commandHandlers: observed.commandHandlers })],
    { processCwd: () => options.projectRoot },
  );

  expect(result.exitCode).not.toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
  expect(result.stdout).toBe(validationCliEmptyOutput());
  expect(result.stderr).toContain(options.expectedLabel);
  expect(result.stderr).toContain(options.expectedSanitizedArgument);
  expect(observed.calls).toEqual([]);
  return result;
}

function expectStructuredSkippedSentinel(stdout: string, reason: string): void {
  const structuredLine = stdout.split("\n").find((line) => line.startsWith("{"));
  expect(structuredLine).toBeDefined();
  expect(JSON.parse(structuredLine ?? validationCliEmptyOutput())).toEqual({ skipped: true, reason });
}

function validationCommonJsonFlag(): string {
  return validationCommonCliOptions.json.flag;
}

function validationCommonScopeFlag(): string {
  return validationCommonCliOptions.scope.flag;
}

function validationRegisteredSubcommandOperands(): readonly {
  readonly commandName: string;
  readonly operand: string;
}[] {
  return Object.values(validationCliDefinition.subcommands)
    .flatMap((subcommand) =>
      subcommand.alias === undefined
        ? [{ commandName: subcommand.commandName, operand: subcommand.commandName }]
        : [
          { commandName: subcommand.commandName, operand: subcommand.commandName },
          { commandName: subcommand.commandName, operand: subcommand.alias },
        ]
    );
}

function syntheticOverrideStage(): ValidationStage {
  return {
    name: SYNTHETIC_OVERRIDE_STAGE_NAME,
    failsPipeline: true,
    participation: {
      default: VALIDATION_STAGE_PARTICIPATION.RUN,
      override: {
        flag: SYNTHETIC_OVERRIDE_FLAG,
        description: SYNTHETIC_OVERRIDE_DESCRIPTION,
        participation: VALIDATION_STAGE_PARTICIPATION.SKIP,
        reason: SYNTHETIC_OVERRIDE_REASON,
      },
    },
    run: async () => ({
      exitCode: VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
      output: observedHandlerOutput(SYNTHETIC_OVERRIDE_STAGE_NAME),
    }),
  };
}

function syntheticDefaultStage(calls: string[]): ValidationStage {
  return {
    name: SYNTHETIC_DEFAULT_STAGE_NAME,
    failsPipeline: true,
    participation: {
      default: VALIDATION_STAGE_PARTICIPATION.RUN,
    },
    run: async () => {
      calls.push(SYNTHETIC_DEFAULT_STAGE_NAME);
      return {
        exitCode: VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
        output: observedHandlerOutput(SYNTHETIC_DEFAULT_STAGE_NAME),
      };
    },
  };
}

function syntheticControlledFailureStage(
  onStarted: () => void,
  release: Promise<void>,
): ValidationStage {
  return {
    name: SYNTHETIC_FAILURE_STAGE_NAME,
    failsPipeline: true,
    participation: {
      default: VALIDATION_STAGE_PARTICIPATION.RUN,
    },
    run: async () => {
      onStarted();
      await release;
      return {
        exitCode: VALIDATION_PIPELINE_DATA.exitCodes.FAILURE,
        output: observedHandlerOutput(SYNTHETIC_FAILURE_STAGE_NAME),
      };
    },
  };
}

function syntheticOverrideStageSet(): {
  readonly calls: readonly string[];
  readonly stages: readonly ValidationStage[];
} {
  const calls: string[] = [];
  return {
    calls,
    stages: [syntheticOverrideStage(), syntheticDefaultStage(calls)],
  };
}

function expectedCliEscapedArgument(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) return character;
    if (codePoint <= 0x1F || codePoint === 0x7F) {
      return String.raw`\x${codePoint.toString(16).padStart(2, "0")}`;
    }
    return character;
  }).join(validationCliEmptyOutput());
}

function observedValidationCommandHandlers(
  exitCode: number = VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
): ObservedValidationCommandHandlers {
  const calls: ObservedValidationCommandCall[] = [];
  const createHandler = (commandName: string) =>
  async (
    options: { readonly files?: string[]; readonly scope?: ValidationScope },
  ) => {
    calls.push({
      commandName,
      ...(options.files === undefined ? {} : { files: options.files }),
      ...(options.scope === undefined ? {} : { scope: options.scope }),
    });
    return {
      exitCode,
      output: observedHandlerOutput(commandName),
    };
  };
  return {
    calls,
    commandHandlers: {
      typescript: createHandler(validationCliDefinition.subcommands.typescript.commandName),
      lint: createHandler(validationCliDefinition.subcommands.lint.commandName),
      circular: createHandler(validationCliDefinition.subcommands.circular.commandName),
      knip: createHandler(validationCliDefinition.subcommands.knip.commandName),
      literal: createHandler(validationCliDefinition.subcommands.literal.commandName),
      markdown: createHandler(validationCliDefinition.subcommands.markdown.commandName),
      format: createHandler(validationCliDefinition.subcommands.format.commandName),
      all: createHandler(validationCliDefinition.subcommands.all.commandName),
    },
  };
}

function observedHandlerOutput(commandName: string): string {
  return `${OBSERVED_HANDLER_OUTPUT_PREFIX}${commandName}`;
}

function outputContainsValidationStageMarker(output: string): boolean {
  return validationPipelineStages.some((stage) => output.includes(stage.name));
}

export async function expectLiteralCommandRejectsFullPipelineLiteralOverride(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.literal.commandName,
    VALIDATION_PIPELINE_DATA.skipLiteralFlag,
  ]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  expect(result.stdout).toBe(validationCliEmptyOutput());
  expect(result.stderr).toContain(VALIDATION_PIPELINE_DATA.skipLiteralFlag);
}

export async function expectCircularCommandRejectsFullPipelineCircularOverride(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.circular.commandName,
    VALIDATION_PIPELINE_DATA.skipCircularFlag,
  ]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  expect(result.stdout).toBe(validationCliEmptyOutput());
  expect(result.stderr).toContain(VALIDATION_PIPELINE_DATA.skipCircularFlag);
}

async function expectStandaloneCommandsRejectFullPipelineOverrideFlags(): Promise<void> {
  await withEmptyValidationProject(async (projectRoot) => {
    for (const { operand, commandName } of validationRegisteredSubcommandOperands()) {
      if (commandName === validationCliDefinition.subcommands.all.commandName) continue;
      for (const overrideFlag of validationAllOverrideFlagsFromStageDescriptors()) {
        const observed = observedValidationCommandHandlers();
        const result = await runValidationInProcessWithDomains(
          [operand, overrideFlag],
          [createValidationDomain({ commandHandlers: observed.commandHandlers })],
          { processCwd: () => projectRoot },
        );

        expect(result.exitCode).not.toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
        expect(result.stdout).toBe(validationCliEmptyOutput());
        expect(result.stderr).toContain(overrideFlag);
        expect(observed.calls).toEqual([]);
      }
    }
  });
}

function commanderExitCode(error: unknown): number | undefined {
  if (error instanceof CommanderError) return error.exitCode;
  if (typeof error !== "object" || error === null) return undefined;
  if ("exitCode" in error && typeof error.exitCode === "number") return error.exitCode;
  if (!("message" in error) || typeof error.message !== "string") return undefined;

  const match = /^process\.exit unexpectedly called with "(\d+)"$/u.exec(error.message);
  if (match === null) return undefined;

  return Number(match[1]);
}
