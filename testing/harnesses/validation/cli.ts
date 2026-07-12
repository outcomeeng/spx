import { CommanderError } from "commander";
import { execa } from "execa";
import { symlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { expect, it } from "vitest";

import {
  formatValidationStageSkipJsonOutput,
  formatValidationStageSkipOutput,
  VALIDATION_COMMAND_OUTPUT,
} from "@/commands/validation";
import { VALIDATION_SUMMARY_STATUS, VALIDATION_SYMBOLS } from "@/commands/validation/format";
import { lintCommand } from "@/commands/validation/lint";
import { OUTPUT_MODE_NAME, OUTPUT_MODE_NAMES, type OutputModeName } from "@/commands/validation/literal";
import type { Domain } from "@/domains/types";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { createValidationDomain, type ValidationCommandHandlers, validationDomain } from "@/interfaces/cli/validation";
import {
  literalValidationCliOptions,
  validationCliDefinition,
  validationCommonCliOptions,
  validationLiteralProblemKinds,
  validationOptionPrefix,
} from "@/interfaces/cli/validation-contract";
import { sanitizeCliArgument, SENTINEL_EMPTY } from "@/lib/sanitize-cli-argument";
import { TOOL_DISCOVERY } from "@/validation/discovery";
import { VALIDATION_STAGE_PARTICIPATION, type ValidationStage } from "@/validation/languages/types";
import { LITERAL_KIND, REMEDIATION } from "@/validation/literal";
import { validationPipelineStages } from "@/validation/registry";
import { validateESLint } from "@/validation/steps/eslint";
import { ESLINT_COMMAND_TOKENS } from "@/validation/steps/eslint-contract";
import { VALIDATION_SCOPES, type ValidationScope } from "@/validation/types";
import {
  LITERAL_TEST_GENERATOR,
  LITERAL_TEST_GENERATOR_COUNTS,
  type LiteralSourceReuseFixtureInputs,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import {
  VALIDATION_CLI_GENERATOR,
  VALIDATION_PIPELINE_DATA,
  validationCliEmptyOutputLength,
  validationCliOptionOperandSeparator,
  validationCliPackagedExecutablePath,
  validationCliSuccessExitCodeUpperBound,
  validationCliTempDirectoryPrefix,
  validationCliUnavailableExitCode,
  validationLintSubprocessComplianceScenarios,
  validationLintSubprocessScenarios,
  type ValidationSubprocessScenario,
} from "@testing/generators/validation/validation";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { RejectingUnexpectedValidationSpawnRunner } from "@testing/harnesses/validation/subprocess";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

const SYNTHETIC_OVERRIDE_STAGE_NAME = "Synthetic override stage";
const SYNTHETIC_DEFAULT_STAGE_NAME = "Synthetic default stage";
const SYNTHETIC_FAILURE_STAGE_NAME = "Synthetic failure stage";
const SYNTHETIC_OVERRIDE_FLAG = "--synthetic-override-stage";
const SYNTHETIC_OVERRIDE_DESCRIPTION = "Synthetic override stage flag";
const SYNTHETIC_OVERRIDE_REASON = "synthetic-override-stage";
const OBSERVED_HANDLER_OUTPUT_PREFIX = "validation-handler-called:";
const OBSERVED_HANDLER_TERMINAL_OUTPUT_PREFIX = "validation-terminal-output:";
const OBSERVED_HANDLER_EXIT_CODE = 7;

const VALIDATION_CLI_CONTRACT = {
  domain: validationCliDefinition.domain,
  subcommands: validationCliDefinition.subcommands,
  help: {
    longFlag: validationCliDefinition.commanderHelpOperands.longFlag,
    pathOperand: validationCliDefinition.pathOperands.optionalVariadic,
    literalFlags: Object.values(literalValidationCliOptions).map((option) => option.flag),
    literalProblemKinds: validationLiteralProblemKinds,
  },
  options: {
    scope: validationCommonCliOptions.scope.flag,
    quiet: validationCommonCliOptions.quiet.flag,
    json: validationCommonCliOptions.json.flag,
  },
  diagnostics: {
    unknownSubcommand: {
      label: validationCliDefinition.diagnostics.unknownSubcommand.messageLabel,
      exitCode: validationCliDefinition.diagnostics.unknownSubcommand.exitCode,
    },
    unknownLiteralProblemKind: {
      label: validationCliDefinition.diagnostics.unknownLiteralProblemKind.messageLabel,
      exitCode: validationCliDefinition.diagnostics.unknownLiteralProblemKind.exitCode,
    },
    invalidPathOperand: {
      label: validationCliDefinition.diagnostics.invalidPathOperand.messageLabel,
      reason: validationCliDefinition.diagnostics.invalidPathOperand.reason,
      exitCode: validationCliDefinition.diagnostics.invalidPathOperand.exitCode,
    },
  },
} as const;

export interface ValidationCliResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

export interface ValidationCliRunOptions {
  readonly cwd?: string;
  readonly timeout?: number;
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
  let observedExitCode = validationCliEmptyOutputLength();
  const program = createCliProgram({
    domains,
    processCwd: options.processCwd,
    writeStdout: (output) => {
      stdout.push(output);
      options.onStdout?.(output);
    },
    writeStderr: (output) => stderr.push(output),
    setExitCode: (exitCode) => {
      observedExitCode = exitCode;
    },
    exit: (exitCode) => {
      throw new CommanderError(
        exitCode,
        VALIDATION_CLI_CONTRACT.domain.commandName,
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
      [VALIDATION_CLI_CONTRACT.domain.commandName, ...args],
      { from: SPX_COMMANDER_PARSE_SOURCE },
    );
    return {
      exitCode: observedExitCode,
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
  testFn: (productDir: string) => Promise<void>,
): Promise<void> {
  return withTempDir(validationCliTempDirectoryPrefix(), testFn);
}

export function validationCliPackagedArgs(args: readonly string[]): string[] {
  return [validationCliPackagedExecutablePath(), VALIDATION_CLI_CONTRACT.domain.commandName, ...args];
}

export function validationCliOptionName(flag: string): string {
  const name = flag.split(validationCliOptionOperandSeparator()).at(0);
  return name ?? flag;
}

export function validationCliEmptyOutput(): string {
  return VALIDATION_CLI_CONTRACT.domain.commandName.slice(
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

export function registerLintSubprocessScenarioTests(): void {
  registerValidationSubprocessScenarios(validationLintSubprocessScenarios());
}

export function registerLintSubprocessComplianceTests(): void {
  registerValidationSubprocessScenarios(validationLintSubprocessComplianceScenarios());
  it("spawns the discovered ESLint executable for a TypeScript product", () =>
    runLintSubprocessPathCompliance(PROJECT_FIXTURES.CLEAN_PROJECT, true));
  it("does not enter discovery or the ESLint subprocess path when TypeScript is absent", () =>
    runLintSubprocessPathCompliance(PROJECT_FIXTURES.PYTHON_PROJECT, false));
  it("does not enter discovery or the ESLint subprocess path when flat config is absent", () =>
    runLintSubprocessPathCompliance(PROJECT_FIXTURES.TYPESCRIPT_NO_ESLINT, false));
}

async function runLintSubprocessPathCompliance(
  fixture: (typeof PROJECT_FIXTURES)[keyof typeof PROJECT_FIXTURES],
  expectSpawn: boolean,
): Promise<void> {
  await withValidationEnv({ fixture }, async ({ path: productDir }) => {
    const executable = join(productDir, sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath()));
    const runner = new RejectingUnexpectedValidationSpawnRunner({ command: executable, stdio: "pipe" });
    const discoveryCalls: string[] = [];
    const result = await runValidationInProcessWithDomains(
      [VALIDATION_CLI_CONTRACT.subcommands.lint.commandName],
      [createValidationDomain({
        commandHandlers: {
          lint: (options) =>
            lintCommand(options, {
              discoverTool: async (tool) => {
                discoveryCalls.push(tool);
                return {
                  found: true,
                  location: { tool, path: executable, source: TOOL_DISCOVERY.SOURCES.PROJECT },
                };
              },
              validateESLint: (context, _processRunner, outputStreams) =>
                validateESLint(context, runner, outputStreams),
            }),
        },
      })],
      { processCwd: () => productDir },
    );

    if (expectSpawn) {
      expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
      expect(discoveryCalls).toEqual([ESLINT_COMMAND_TOKENS.COMMAND]);
      expect(runner.commands).toEqual([executable]);
      expect(runner.spawnOptions?.stdio).toBe("pipe");
    } else {
      expect(discoveryCalls).toEqual([]);
      expect(runner.commands).toEqual([]);
    }
  });
}

function registerValidationSubprocessScenarios(scenarios: readonly ValidationSubprocessScenario[]): void {
  for (const scenario of scenarios) {
    it(
      scenario.title,
      { timeout: scenario.timeout },
      async () => {
        await withValidationEnv({ fixture: scenario.fixture }, async ({ path }) => {
          expectValidationSubprocessResult(
            await runValidationSubprocess(scenario.args, { cwd: path, timeout: scenario.timeout }),
            scenario,
          );
        });
      },
    );
  }
}

export async function expectRegisteredSubcommandRunsHandlerWithoutDispatchFailure(): Promise<void> {
  await withEmptyValidationProject(async (productDir) => {
    for (const { operand, commandName } of validationRegisteredSubcommandOperands()) {
      const observed = observedValidationCommandHandlers();
      const result = await runValidationInProcessWithDomains(
        [operand],
        [createValidationDomain({ commandHandlers: observed.commandHandlers })],
        { processCwd: () => productDir },
      );

      expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
      expect(result.stdout).toContain(observedHandlerTerminalOutput(commandName));
      expect(result.stdout).not.toContain(observedHandlerOutput(commandName));
      expect(observed.calls.map((call) => call.commandName)).toEqual([commandName]);
      expect(result.stderr).not.toContain(VALIDATION_CLI_CONTRACT.diagnostics.unknownSubcommand.label);
    }
  });
}

export async function expectRegisteredSubcommandPropagatesNonZeroExitCode(): Promise<void> {
  await withEmptyValidationProject(async (productDir) => {
    const observed = observedValidationCommandHandlers(OBSERVED_HANDLER_EXIT_CODE);
    const result = await runValidationInProcessWithDomains(
      [VALIDATION_CLI_CONTRACT.subcommands.format.commandName],
      [createValidationDomain({ commandHandlers: observed.commandHandlers })],
      { processCwd: () => productDir },
    );

    expect(result.exitCode).toBe(OBSERVED_HANDLER_EXIT_CODE);
    expect(result.stderr).toContain(
      observedHandlerTerminalOutput(VALIDATION_CLI_CONTRACT.subcommands.format.commandName),
    );
    expect(result.stderr).not.toContain(observedHandlerOutput(VALIDATION_CLI_CONTRACT.subcommands.format.commandName));
    expect(result.stdout).not.toContain(
      observedHandlerTerminalOutput(VALIDATION_CLI_CONTRACT.subcommands.format.commandName),
    );
    expect(observed.calls).toEqual([{ commandName: VALIDATION_CLI_CONTRACT.subcommands.format.commandName }]);
  });
}

export async function expectLiteralReportRemainsOnStdoutWhenFindingsSetNonZeroExit(
  outputMode: OutputModeName,
): Promise<void> {
  await withLiteralFixtureEnv({}, async (env) => {
    const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceReuseFixtureInputs());
    await env.writeSourceReuseFixture(inputs);

    const result = await runValidationInProcess([
      VALIDATION_CLI_CONTRACT.subcommands.literal.commandName,
      ...literalReportModeArgument(outputMode),
    ], { processCwd: () => env.productDir });

    expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.FAILURE);
    expectLiteralReport(outputMode, result.stdout, inputs);
    expect(result.stderr).toBe(validationCliEmptyOutput());
  });
}

export function registerLiteralReportModeMappings(): void {
  it.each(OUTPUT_MODE_NAMES)("keeps %s literal findings on stdout", async (outputMode) => {
    await expectLiteralReportRemainsOnStdoutWhenFindingsSetNonZeroExit(outputMode);
  });
}

function expectLiteralReport(
  outputMode: OutputModeName,
  stdout: string,
  inputs: LiteralSourceReuseFixtureInputs,
): void {
  const literal = JSON.stringify(inputs.literal);
  const line = LITERAL_TEST_GENERATOR_COUNTS.one;
  switch (outputMode) {
    case OUTPUT_MODE_NAME.TEXT:
      expect(stdout).toBe(
        `[reuse] ${literal} ${inputs.testFile}:${line}${VALIDATION_PIPELINE_DATA.outputLineSeparator}`,
      );
      return;
    case OUTPUT_MODE_NAME.VERBOSE:
      expect(stdout).toBe(
        [
          `Literal: ${line} problems (reuse: ${line}, dupe: ${LITERAL_TEST_GENERATOR_COUNTS.none})`,
          "REUSE",
          inputs.testFile,
          `  line ${line}: ${literal} also in ${inputs.sourceFile}:${line}`,
        ].join(VALIDATION_PIPELINE_DATA.outputLineSeparator) + VALIDATION_PIPELINE_DATA.outputLineSeparator,
      );
      return;
    case OUTPUT_MODE_NAME.FILES_WITH_PROBLEMS:
      expect(stdout).toBe(inputs.testFile + VALIDATION_PIPELINE_DATA.outputLineSeparator);
      return;
    case OUTPUT_MODE_NAME.LITERALS:
      expect(stdout).toBe(literal + VALIDATION_PIPELINE_DATA.outputLineSeparator);
      return;
    case OUTPUT_MODE_NAME.JSON:
      expect(JSON.parse(stdout)).toEqual({
        srcReuse: [{
          kind: LITERAL_KIND.STRING,
          value: inputs.literal,
          remediation: REMEDIATION.IMPORT_FROM_SOURCE,
          test: { file: inputs.testFile, line },
          src: [{ file: inputs.sourceFile, line }],
        }],
        testDupe: [],
      });
  }
}

export async function expectFullPipelineStreamsProgressBeforeFailureSummary(): Promise<void> {
  const failureStarted = createDeferred<void>();
  const releaseFailure = createDeferred<void>();
  let observedProgressBeforeFailureCompleted = false;
  const resultPromise = runValidationInProcessWithDomains(
    [VALIDATION_CLI_CONTRACT.subcommands.all.commandName],
    [createValidationDomain({
      validationStages: [
        syntheticDefaultStage([]),
        syntheticControlledFailureStage(failureStarted.resolve, releaseFailure.promise),
      ],
    })],
    {
      onStdout: (output) => {
        if (output.includes(observedHandlerTerminalOutput(SYNTHETIC_DEFAULT_STAGE_NAME))) {
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
  expect(result.stdout).toContain(observedHandlerTerminalOutput(SYNTHETIC_DEFAULT_STAGE_NAME));
  expect(result.stdout).toContain(observedHandlerTerminalOutput(SYNTHETIC_FAILURE_STAGE_NAME));
  expect(result.stdout).not.toContain(observedHandlerOutput(SYNTHETIC_DEFAULT_STAGE_NAME));
  expect(result.stdout).not.toContain(observedHandlerOutput(SYNTHETIC_FAILURE_STAGE_NAME));
  expect(result.stderr).toContain(`${VALIDATION_SYMBOLS.FAILURE} Validation ${VALIDATION_SUMMARY_STATUS.FAILED}`);
  expect(result.stderr).not.toContain(observedHandlerOutput(SYNTHETIC_DEFAULT_STAGE_NAME));
  expect(result.stderr).not.toContain(observedHandlerOutput(SYNTHETIC_FAILURE_STAGE_NAME));
}

export async function expectValidationAllJsonOutputIsMachineReadable(): Promise<void> {
  const calls: string[] = [];
  const result = await runValidationInProcessWithDomains(
    [VALIDATION_CLI_CONTRACT.subcommands.all.commandName, validationCommonJsonFlag()],
    [createValidationDomain({ validationStages: [syntheticDefaultStage(calls), syntheticJsonStage()] })],
  );
  const records = result.stdout.split("\n").filter((line) => line.length > 0);

  expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
  expect(result.stderr).toBe(validationCliEmptyOutput());
  expect(records).toHaveLength(2);
  for (const record of records) {
    expect(() => JSON.parse(record)).not.toThrow();
  }
}

export async function expectValidationAllJsonOutputWithRealSubprocessIsMachineReadable(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const result = await runValidationSubprocess(
      [VALIDATION_CLI_CONTRACT.subcommands.all.commandName, validationCommonJsonFlag()],
      { cwd: path, timeout: VALIDATION_PIPELINE_DATA.allTimeout },
    );
    const records = result.stdout.split("\n").filter((line) => line.length > 0).map((line) =>
      JSON.parse(line) as {
        readonly stage?: string;
      }
    );

    expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
    expect(result.stderr).toBe(validationCliEmptyOutput());
    expect(records.some((record) => record.stage === VALIDATION_PIPELINE_DATA.stageNames.ESLINT)).toBe(true);
    expect(records.some((record) => record.stage === VALIDATION_PIPELINE_DATA.stageNames.TYPESCRIPT)).toBe(true);
  });
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
      [VALIDATION_CLI_CONTRACT.subcommands.circular.commandName],
      { cwd: path },
    );

    expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
    expect(result.stdout).toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND);
    expect(result.stdout).not.toMatch(VALIDATION_PIPELINE_DATA.stepLinePattern);
    expect(result.stdout).not.toContain(VALIDATION_CLI_CONTRACT.diagnostics.unknownSubcommand.label);
  });
}

export async function expectStandaloneTypeScriptCapturesSubprocessOutput(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.WITH_TYPE_ERRORS }, async ({ path }) => {
    const result = await runValidationSubprocess(
      [VALIDATION_CLI_CONTRACT.subcommands.typescript.commandName],
      { cwd: path },
    );

    expect(result.exitCode).not.toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
    expect(result.stdout).not.toMatch(/error TS\d+:/u);
    expect(result.stderr).toMatch(/error TS\d+:/u);
  });
}

export async function expectValidationAllForwardsProductionScope(): Promise<void> {
  await withEmptyValidationProject(async (productDir) => {
    const observed = observedValidationCommandHandlers();
    const result = await runValidationInProcessWithDomains(
      [
        VALIDATION_CLI_CONTRACT.subcommands.all.commandName,
        validationCommonScopeFlag(),
        VALIDATION_PIPELINE_DATA.productionScope,
      ],
      [createValidationDomain({ commandHandlers: observed.commandHandlers })],
      { processCwd: () => productDir },
    );

    expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
    expect(observed.calls).toEqual([{
      commandName: VALIDATION_CLI_CONTRACT.subcommands.all.commandName,
      scope: VALIDATION_PIPELINE_DATA.productionScope,
    }]);
  });
}

export async function expectValidationAllForwardsFileScope(): Promise<void> {
  await withEmptyValidationProject(async (productDir) => {
    const file = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    const observed = observedValidationCommandHandlers();
    const result = await runValidationInProcessWithDomains(
      [VALIDATION_CLI_CONTRACT.subcommands.all.commandName, file],
      [createValidationDomain({ commandHandlers: observed.commandHandlers })],
      { processCwd: () => productDir },
    );

    expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
    expect(observed.calls).toEqual([{
      commandName: VALIDATION_CLI_CONTRACT.subcommands.all.commandName,
      files: [file],
      scope: VALIDATION_SCOPES.FULL,
    }]);
  });
}

export async function expectValidationAllForwardsDirectoryScope(): Promise<void> {
  await withEmptyValidationProject(async (productDir) => {
    const directory = dirname(sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath()));
    const observed = observedValidationCommandHandlers();
    const result = await runValidationInProcessWithDomains(
      [VALIDATION_CLI_CONTRACT.subcommands.all.commandName, directory],
      [createValidationDomain({ commandHandlers: observed.commandHandlers })],
      { processCwd: () => productDir },
    );

    expect(result.exitCode).toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
    expect(observed.calls).toEqual([{
      commandName: VALIDATION_CLI_CONTRACT.subcommands.all.commandName,
      files: [directory],
      scope: VALIDATION_SCOPES.FULL,
    }]);
  });
}

export async function expectLiteralCommandRejectsInvalidKindBeforeStageWork(): Promise<void> {
  await withEmptyValidationProject(async (productDir) => {
    const unsafeKind = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.invalidLiteralProblemKind());
    const result = await expectDispatchFailureSkipsInjectedHandlers({
      args: [
        VALIDATION_CLI_CONTRACT.subcommands.literal.commandName,
        validationCliOptionName(VALIDATION_CLI_CONTRACT.help.literalFlags[1]),
        unsafeKind,
      ],
      expectedLabel: VALIDATION_CLI_CONTRACT.diagnostics.unknownLiteralProblemKind.label,
      expectedSanitizedArgument: sanitizeCliArgument(unsafeKind),
      productDir,
    });

    expect(result.exitCode).toBe(VALIDATION_CLI_CONTRACT.diagnostics.unknownLiteralProblemKind.exitCode);
    expect(result.stderr).not.toContain(VALIDATION_CLI_CONTRACT.diagnostics.unknownSubcommand.label);
  });
}

export async function expectPathEscapeRejectedBeforeValidation(): Promise<void> {
  await withEmptyValidationProject(async (productDir) => {
    const result = await expectDispatchFailureSkipsInjectedHandlers({
      args: [
        VALIDATION_CLI_CONTRACT.subcommands.format.commandName,
        VALIDATION_PIPELINE_DATA.escapingPathOperand,
      ],
      expectedLabel: VALIDATION_CLI_CONTRACT.diagnostics.invalidPathOperand.label,
      expectedSanitizedArgument: sanitizeCliArgument(VALIDATION_PIPELINE_DATA.escapingPathOperand),
      productDir,
    });

    expect(result.exitCode).toBe(VALIDATION_CLI_CONTRACT.diagnostics.invalidPathOperand.exitCode);
    expect(result.stderr).toContain(VALIDATION_CLI_CONTRACT.diagnostics.invalidPathOperand.reason);
  });
}

export async function expectSymlinkedInvocationDirectoryResolvesInProductOperand(): Promise<void> {
  await withEmptyValidationProject(async (productDir) => {
    const symlinkRoot = join(dirname(productDir), `${basename(productDir)}-link`);
    const operand = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    const observed = observedValidationCommandHandlers();
    await symlink(productDir, symlinkRoot, "dir");

    const result = await runValidationInProcessWithDomains(
      [
        VALIDATION_CLI_CONTRACT.subcommands.format.commandName,
        operand,
      ],
      [createValidationDomain({ commandHandlers: observed.commandHandlers })],
      { processCwd: () => symlinkRoot },
    );

    expect(result.exitCode).not.toBe(VALIDATION_CLI_CONTRACT.diagnostics.invalidPathOperand.exitCode);
    expect(result.stdout).toContain(
      observedHandlerTerminalOutput(VALIDATION_CLI_CONTRACT.subcommands.format.commandName),
    );
    expect(observed.calls).toEqual([{
      commandName: VALIDATION_CLI_CONTRACT.subcommands.format.commandName,
      files: [operand],
    }]);
    expect(result.stderr).not.toContain(VALIDATION_CLI_CONTRACT.diagnostics.invalidPathOperand.label);
    expect(result.stderr).not.toContain(VALIDATION_CLI_CONTRACT.diagnostics.invalidPathOperand.reason);
  });
}

export async function expectUnknownSubcommandReachesSanitizedDiagnostic(): Promise<void> {
  const unknownStage = sampleLiteralTestValue(
    VALIDATION_CLI_GENERATOR.unknownSubcommand()
      .filter((candidate) => !candidate.startsWith(validationOptionPrefix)),
  );
  await withEmptyValidationProject(async (productDir) => {
    const result = await expectDispatchFailureSkipsInjectedHandlers({
      args: [unknownStage],
      expectedLabel: VALIDATION_CLI_CONTRACT.diagnostics.unknownSubcommand.label,
      expectedSanitizedArgument: sanitizeCliArgument(unknownStage),
      productDir,
    });

    expect(result.exitCode).toBe(VALIDATION_CLI_CONTRACT.diagnostics.unknownSubcommand.exitCode);
  });
}

export async function expectEmptyArgumentReportsSentinel(): Promise<void> {
  const emptyArgument = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.emptyArgument());
  await withEmptyValidationProject(async (productDir) => {
    const result = await expectDispatchFailureSkipsInjectedHandlers({
      args: [emptyArgument],
      expectedLabel: VALIDATION_CLI_CONTRACT.diagnostics.unknownSubcommand.label,
      expectedSanitizedArgument: SENTINEL_EMPTY,
      productDir,
    });

    expect(result.exitCode).toBe(VALIDATION_CLI_CONTRACT.diagnostics.unknownSubcommand.exitCode);
  });
}

export async function expectAsciiControlCharactersEscapedBeforeStderr(): Promise<void> {
  const unsafeArgument = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.controlArgument());
  await withEmptyValidationProject(async (productDir) => {
    const result = await expectDispatchFailureSkipsInjectedHandlers({
      args: [unsafeArgument],
      expectedLabel: VALIDATION_CLI_CONTRACT.diagnostics.unknownSubcommand.label,
      expectedSanitizedArgument: expectedCliEscapedArgument(unsafeArgument),
      productDir,
    });

    expect(result.exitCode).toBe(VALIDATION_CLI_CONTRACT.diagnostics.unknownSubcommand.exitCode);
    expect(result.stderr).not.toContain(unsafeArgument);
  });
}

export async function expectMultiByteUnicodePreservedInStderr(): Promise<void> {
  const unicodeArgument = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.unicodeArgument());
  await withEmptyValidationProject(async (productDir) => {
    const result = await expectDispatchFailureSkipsInjectedHandlers({
      args: [unicodeArgument],
      expectedLabel: VALIDATION_CLI_CONTRACT.diagnostics.unknownSubcommand.label,
      expectedSanitizedArgument: unicodeArgument,
      productDir,
    });

    expect(result.exitCode).toBe(VALIDATION_CLI_CONTRACT.diagnostics.unknownSubcommand.exitCode);
  });
}

export function registerValidationCliDispatchPropertyTests(): void {
  it(
    "every unknown subcommand string reaches the unknown-subcommand diagnostic path",
    { timeout: sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.propertyOptions()).timeout },
    async () => {
      await withEmptyValidationProject(async (productDir) => {
        await assertProperty(
          VALIDATION_CLI_GENERATOR.unknownSubcommand(),
          async (candidate) => {
            const observed = observedValidationCommandHandlers();
            const result = await runValidationInProcessWithDomains(
              [candidate],
              [createValidationDomain({ commandHandlers: observed.commandHandlers })],
              { processCwd: () => productDir },
            );

            expect(result.exitCode).not.toBe(VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS);
            expect(result.stderr).toContain(VALIDATION_CLI_CONTRACT.diagnostics.unknownSubcommand.label);
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
      await withEmptyValidationProject(async (productDir) => {
        const unknownSubcommand = sampleLiteralTestValue(
          VALIDATION_CLI_GENERATOR.unknownSubcommand()
            .filter((candidate) => !candidate.startsWith(validationOptionPrefix)),
        );
        const invalidKind = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.invalidLiteralProblemKind());
        await expectDispatchFailureSkipsInjectedHandlers({
          args: [unknownSubcommand],
          expectedLabel: VALIDATION_CLI_CONTRACT.diagnostics.unknownSubcommand.label,
          expectedSanitizedArgument: sanitizeCliArgument(unknownSubcommand),
          productDir,
        });
        await expectDispatchFailureSkipsInjectedHandlers({
          args: [
            VALIDATION_CLI_CONTRACT.subcommands.literal.commandName,
            validationCliOptionName(VALIDATION_CLI_CONTRACT.help.literalFlags[1]),
            invalidKind,
          ],
          expectedLabel: VALIDATION_CLI_CONTRACT.diagnostics.unknownLiteralProblemKind.label,
          expectedSanitizedArgument: sanitizeCliArgument(invalidKind),
          productDir,
        });
        await expectDispatchFailureSkipsInjectedHandlers({
          args: [
            VALIDATION_CLI_CONTRACT.subcommands.format.commandName,
            VALIDATION_PIPELINE_DATA.escapingPathOperand,
          ],
          expectedLabel: VALIDATION_CLI_CONTRACT.diagnostics.invalidPathOperand.label,
          expectedSanitizedArgument: sanitizeCliArgument(VALIDATION_PIPELINE_DATA.escapingPathOperand),
          productDir,
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
      VALIDATION_CLI_CONTRACT.subcommands.all.commandName,
      SYNTHETIC_OVERRIDE_FLAG,
    ],
    [createValidationDomain({
      validationStages: humanStages.stages,
    })],
  );
  const quietStages = syntheticOverrideStageSet();
  const quietResult = await runValidationInProcessWithDomains(
    [
      VALIDATION_CLI_CONTRACT.subcommands.all.commandName,
      SYNTHETIC_OVERRIDE_FLAG,
      VALIDATION_CLI_CONTRACT.options.quiet,
    ],
    [createValidationDomain({
      validationStages: quietStages.stages,
    })],
  );
  const jsonStages = syntheticOverrideStageSet();
  const jsonResult = await runValidationInProcessWithDomains(
    [
      VALIDATION_CLI_CONTRACT.subcommands.all.commandName,
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
      VALIDATION_CLI_CONTRACT.subcommands.all.commandName,
      validationCommonScopeFlag(),
      VALIDATION_PIPELINE_DATA.productionScope,
      SYNTHETIC_OVERRIDE_FLAG,
    ],
    [createValidationDomain({
      validationStages: productionStages.stages,
    })],
  );

  expect(humanResult.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(humanResult.stdout).toContain(
    formatValidationStageSkipOutput(SYNTHETIC_OVERRIDE_STAGE_NAME, SYNTHETIC_OVERRIDE_FLAG),
  );
  expect(humanResult.stdout).not.toContain(observedHandlerOutput(SYNTHETIC_OVERRIDE_STAGE_NAME));
  expect(humanResult.stdout).toContain(observedHandlerTerminalOutput(SYNTHETIC_DEFAULT_STAGE_NAME));
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
  expect(jsonResult.stdout).toContain(observedHandlerTerminalOutput(SYNTHETIC_DEFAULT_STAGE_NAME));
  expect(jsonStages.calls).toEqual([SYNTHETIC_DEFAULT_STAGE_NAME]);
  expect(productionResult.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(productionResult.stdout).toContain(
    formatValidationStageSkipOutput(SYNTHETIC_OVERRIDE_STAGE_NAME, SYNTHETIC_OVERRIDE_FLAG),
  );
  expect(productionResult.stdout).not.toContain(observedHandlerOutput(SYNTHETIC_OVERRIDE_STAGE_NAME));
  expect(productionResult.stdout).toContain(observedHandlerTerminalOutput(SYNTHETIC_DEFAULT_STAGE_NAME));
  expect(productionStages.calls).toEqual([SYNTHETIC_DEFAULT_STAGE_NAME]);
}

export async function expectLiteralHelpListsLiteralFlagsAndProblemKinds(): Promise<void> {
  const result = await runValidationInProcess([
    VALIDATION_CLI_CONTRACT.subcommands.literal.commandName,
    VALIDATION_CLI_CONTRACT.help.longFlag,
  ]);

  expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(result.stderr).toHaveLength(validationCliEmptyOutputLength());
  for (const flag of VALIDATION_CLI_CONTRACT.help.literalFlags) {
    expect(result.stdout).toContain(flag);
  }
  expect(result.stdout).toContain(VALIDATION_CLI_CONTRACT.help.pathOperand);
  for (const kind of VALIDATION_CLI_CONTRACT.help.literalProblemKinds) {
    expect(result.stdout).toContain(kind);
  }
}

export async function expectValidationAllHelpListsOverrideFlags(): Promise<void> {
  const result = await runValidationInProcess([
    VALIDATION_CLI_CONTRACT.subcommands.all.commandName,
    VALIDATION_CLI_CONTRACT.help.longFlag,
  ]);
  const syntheticResult = await runValidationInProcessWithDomains(
    [
      VALIDATION_CLI_CONTRACT.subcommands.all.commandName,
      VALIDATION_CLI_CONTRACT.help.longFlag,
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
    VALIDATION_CLI_CONTRACT.subcommands.literal.commandName,
    VALIDATION_CLI_CONTRACT.help.longFlag,
  ]);
  const syntheticResult = await runValidationInProcessWithDomains(
    [
      VALIDATION_CLI_CONTRACT.subcommands.literal.commandName,
      VALIDATION_CLI_CONTRACT.help.longFlag,
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
  readonly productDir: string;
}): Promise<ValidationCliResult> {
  const observed = observedValidationCommandHandlers();
  const result = await runValidationInProcessWithDomains(
    options.args,
    [createValidationDomain({ commandHandlers: observed.commandHandlers })],
    { processCwd: () => options.productDir },
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
  const sentinel = JSON.parse(structuredLine ?? validationCliEmptyOutput()) as {
    readonly skipped: boolean;
    readonly reason: string;
    readonly durationMs: number;
  };
  expect(sentinel).toMatchObject({ skipped: true, reason });
  expect(sentinel.durationMs).toEqual(expect.any(Number));
  expect(sentinel.durationMs).toBeGreaterThanOrEqual(0);
}

function validationCommonJsonFlag(): string {
  return VALIDATION_CLI_CONTRACT.options.json;
}

function validationCommonScopeFlag(): string {
  return VALIDATION_CLI_CONTRACT.options.scope;
}

function validationRegisteredSubcommandOperands(): readonly {
  readonly commandName: string;
  readonly operand: string;
}[] {
  return Object.values(VALIDATION_CLI_CONTRACT.subcommands)
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
        terminalOutput: observedHandlerTerminalOutput(SYNTHETIC_DEFAULT_STAGE_NAME),
      };
    },
  };
}

function syntheticJsonStage(): ValidationStage {
  return {
    name: SYNTHETIC_DEFAULT_STAGE_NAME,
    failsPipeline: true,
    participation: {
      default: VALIDATION_STAGE_PARTICIPATION.RUN,
    },
    run: async () => ({
      exitCode: VALIDATION_PIPELINE_DATA.exitCodes.SUCCESS,
      output: formatValidationStageSkipJsonOutput(SYNTHETIC_OVERRIDE_REASON, validationCliEmptyOutputLength()),
      structuredOutput: true,
    }),
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
        terminalOutput: observedHandlerTerminalOutput(SYNTHETIC_FAILURE_STAGE_NAME),
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
      terminalOutput: observedHandlerTerminalOutput(commandName),
    };
  };
  return {
    calls,
    commandHandlers: {
      typescript: createHandler(VALIDATION_CLI_CONTRACT.subcommands.typescript.commandName),
      lint: createHandler(VALIDATION_CLI_CONTRACT.subcommands.lint.commandName),
      circular: createHandler(VALIDATION_CLI_CONTRACT.subcommands.circular.commandName),
      knip: createHandler(VALIDATION_CLI_CONTRACT.subcommands.knip.commandName),
      literal: createHandler(VALIDATION_CLI_CONTRACT.subcommands.literal.commandName),
      markdown: createHandler(VALIDATION_CLI_CONTRACT.subcommands.markdown.commandName),
      format: createHandler(VALIDATION_CLI_CONTRACT.subcommands.format.commandName),
      all: createHandler(VALIDATION_CLI_CONTRACT.subcommands.all.commandName),
    },
  };
}

function literalReportModeArgument(outputMode: OutputModeName): readonly string[] {
  switch (outputMode) {
    case OUTPUT_MODE_NAME.TEXT:
      return [];
    case OUTPUT_MODE_NAME.VERBOSE:
      return [validationCliOptionName(VALIDATION_CLI_CONTRACT.help.literalFlags[4])];
    case OUTPUT_MODE_NAME.FILES_WITH_PROBLEMS:
      return [validationCliOptionName(VALIDATION_CLI_CONTRACT.help.literalFlags[2])];
    case OUTPUT_MODE_NAME.LITERALS:
      return [validationCliOptionName(VALIDATION_CLI_CONTRACT.help.literalFlags[3])];
    case OUTPUT_MODE_NAME.JSON:
      return [VALIDATION_CLI_CONTRACT.options.json];
  }
}

function observedHandlerOutput(commandName: string): string {
  return `${OBSERVED_HANDLER_OUTPUT_PREFIX}${commandName}`;
}

function observedHandlerTerminalOutput(commandName: string): string {
  return `${OBSERVED_HANDLER_TERMINAL_OUTPUT_PREFIX}${commandName}`;
}

function outputContainsValidationStageMarker(output: string): boolean {
  return validationPipelineStages.some((stage) => output.includes(stage.name));
}

export async function expectLiteralCommandRejectsFullPipelineLiteralOverride(): Promise<void> {
  const result = await runValidationInProcess([
    VALIDATION_CLI_CONTRACT.subcommands.literal.commandName,
    VALIDATION_PIPELINE_DATA.skipLiteralFlag,
  ]);

  expect(result.exitCode).toBe(VALIDATION_CLI_CONTRACT.diagnostics.unknownSubcommand.exitCode);
  expect(result.stdout).toBe(validationCliEmptyOutput());
  expect(result.stderr).toContain(VALIDATION_PIPELINE_DATA.skipLiteralFlag);
}

export async function expectCircularCommandRejectsFullPipelineCircularOverride(): Promise<void> {
  const result = await runValidationInProcess([
    VALIDATION_CLI_CONTRACT.subcommands.circular.commandName,
    VALIDATION_PIPELINE_DATA.skipCircularFlag,
  ]);

  expect(result.exitCode).toBe(VALIDATION_CLI_CONTRACT.diagnostics.unknownSubcommand.exitCode);
  expect(result.stdout).toBe(validationCliEmptyOutput());
  expect(result.stderr).toContain(VALIDATION_PIPELINE_DATA.skipCircularFlag);
}

async function expectStandaloneCommandsRejectFullPipelineOverrideFlags(): Promise<void> {
  await withEmptyValidationProject(async (productDir) => {
    for (const { operand, commandName } of validationRegisteredSubcommandOperands()) {
      if (commandName === VALIDATION_CLI_CONTRACT.subcommands.all.commandName) continue;
      for (const overrideFlag of validationAllOverrideFlagsFromStageDescriptors()) {
        const observed = observedValidationCommandHandlers();
        const result = await runValidationInProcessWithDomains(
          [operand, overrideFlag],
          [createValidationDomain({ commandHandlers: observed.commandHandlers })],
          { processCwd: () => productDir },
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
