import { CommanderError } from "commander";
import { execa } from "execa";
import { symlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { FORMATTING_COMMAND_OUTPUT, LITERAL_PROBLEM_KIND, VALIDATION_COMMAND_OUTPUT } from "@/commands/validation";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { literalValidationCliOptions, validationCliDefinition, validationDomain } from "@/interfaces/cli/validation";
import { sanitizeCliArgument, SENTINEL_EMPTY } from "@/lib/sanitize-cli-argument";
import { validationPipelineStages } from "@/validation/registry";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { FORMATTING_SCENARIO_KIND, formattingScenarios } from "@testing/generators/validation/formatting";
import {
  VALIDATION_CLI_GENERATOR,
  validationAllTypeScriptSubprocessScenarios,
  VALIDATION_PIPELINE_DATA,
  validationCliEmptyOutputLength,
  validationCliOptionOperandSeparator,
  validationCliPackagedExecutablePath,
  validationCliSuccessExitCodeUpperBound,
  validationCliTempDirectoryPrefix,
  validationCliUnavailableExitCode,
  type ValidationSubprocessScenario,
} from "@testing/generators/validation/validation";
import { runFormattingScenario } from "@testing/harnesses/validation/formatting";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { withValidationEnv } from "@testing/harnesses/with-validation-env";

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

export function registerValidationAllTypeScriptSubprocessTests(): void {
  describe("TypeScript validation pipeline subprocess", () => {
    for (const scenario of validationAllTypeScriptSubprocessScenarios()) {
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
  });
}

export async function runValidationInProcess(args: readonly string[]): Promise<ValidationCliResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const program = createCliProgram({
    domains: [validationDomain],
    writeStdout: (output) => stdout.push(output),
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
    const result = await runValidationSubprocess(
      [validationCliDefinition.subcommands.format.commandName],
      { cwd: projectRoot },
    );

    expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
    expect(result.stdout).toContain(FORMATTING_COMMAND_OUTPUT.NO_CONFIG_SKIP_REASON);
    expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
  });
}

export async function expectRegisteredSubcommandPropagatesNonZeroExitCode(): Promise<void> {
  const scenario = formattingScenarios().find(
    (candidate) => candidate.kind === FORMATTING_SCENARIO_KIND.CLI_PROCESS_UNFORMATTED,
  );

  if (scenario === undefined) {
    throw new Error("Formatting CLI process scenario is missing");
  }
  await runFormattingScenario(scenario);
}

export async function expectLiteralCommandRejectsInvalidKindBeforeStageWork(): Promise<void> {
  await withEmptyValidationProject(async (projectRoot) => {
    const unsafeKind = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.invalidLiteralProblemKind());
    const result = await runValidationSubprocess(
      [
        validationCliDefinition.subcommands.literal.commandName,
        validationCliOptionName(literalValidationCliOptions.kind),
        unsafeKind,
      ],
      { cwd: projectRoot },
    );

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownLiteralProblemKind.exitCode);
    expect(result.stdout).toBe(validationCliEmptyOutput());
    expect(result.stderr).toContain(validationCliDefinition.diagnostics.unknownLiteralProblemKind.messageLabel);
    expect(result.stderr).toContain(sanitizeCliArgument(unsafeKind));
    expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
  });
}

export async function expectPathEscapeRejectedBeforeValidation(): Promise<void> {
  await withEmptyValidationProject(async (productRoot) => {
    const result = await runValidationSubprocess(
      [
        validationCliDefinition.subcommands.format.commandName,
        VALIDATION_PIPELINE_DATA.escapingPathOperand,
      ],
      { cwd: productRoot },
    );

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.invalidPathOperand.exitCode);
    expect(result.stdout).toBe(validationCliEmptyOutput());
    expect(result.stderr).toContain(validationCliDefinition.diagnostics.invalidPathOperand.messageLabel);
    expect(result.stderr).toContain(sanitizeCliArgument(VALIDATION_PIPELINE_DATA.escapingPathOperand));
    expect(result.stderr).toContain(validationCliDefinition.diagnostics.invalidPathOperand.reason);
    expect(result.stderr).not.toContain(VALIDATION_COMMAND_OUTPUT.FORMATTING_NO_ISSUES);
  });
}

export async function expectSymlinkedInvocationDirectoryResolvesInProductOperand(): Promise<void> {
  await withEmptyValidationProject(async (productRoot) => {
    const symlinkRoot = join(dirname(productRoot), `${basename(productRoot)}-link`);
    const operand = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    await symlink(productRoot, symlinkRoot, "dir");

    const result = await runValidationSubprocess(
      [
        validationCliDefinition.subcommands.format.commandName,
        operand,
      ],
      { cwd: symlinkRoot },
    );

    expect(result.exitCode).not.toBe(validationCliDefinition.diagnostics.invalidPathOperand.exitCode);
    expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.invalidPathOperand.messageLabel);
    expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.invalidPathOperand.reason);
  });
}

export async function expectUnknownSubcommandReachesSanitizedDiagnostic(): Promise<void> {
  const unknownStage = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.unknownSubcommand());
  const result = await runValidationSubprocess([unknownStage]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  expect(result.stderr).toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
  expect(result.stderr).toContain(unknownStage);
}

export async function expectEmptyArgumentReportsSentinel(): Promise<void> {
  const result = await runValidationSubprocess([
    sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.emptyArgument()),
  ]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  expect(result.stderr).toContain(SENTINEL_EMPTY);
}

export async function expectAsciiControlCharactersEscapedBeforeStderr(): Promise<void> {
  const unsafeArgument = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.controlArgument());
  const result = await runValidationSubprocess([unsafeArgument]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  expect(result.stderr).toContain(sanitizeCliArgument(unsafeArgument));
  expect(result.stderr).not.toContain(unsafeArgument);
}

export async function expectMultiByteUnicodePreservedInStderr(): Promise<void> {
  const unicodeArgument = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.unicodeArgument());
  const result = await runValidationSubprocess([unicodeArgument]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  expect(result.stderr).toContain(unicodeArgument);
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
  expect(result.stdout).toContain(LITERAL_PROBLEM_KIND.REUSE);
  expect(result.stdout).toContain(LITERAL_PROBLEM_KIND.DUPE);
}

export async function expectValidationAllHelpListsOverrideFlags(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.all.commandName,
    validationCliDefinition.commanderHelpOperands.longFlag,
  ]);

  expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(result.stderr).toHaveLength(validationCliEmptyOutputLength());
  for (const flag of validationAllOverrideFlagsFromStageDescriptors()) {
    expect(result.stdout).toContain(flag);
  }
}

export async function expectLiteralHelpOmitsValidationAllOverrideFlags(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.literal.commandName,
    validationCliDefinition.commanderHelpOperands.longFlag,
  ]);

  expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(result.stderr).toHaveLength(validationCliEmptyOutputLength());
  for (const flag of validationAllOverrideFlagsFromStageDescriptors()) {
    expect(result.stdout).not.toContain(flag);
  }
}

function validationAllOverrideFlagsFromStageDescriptors(): readonly `--${string}`[] {
  return validationPipelineStages
    .flatMap((stage) => {
      const override = stage.participation.override;
      if (override === undefined) return [];
      return [override.flag];
    });
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

function commanderExitCode(error: unknown): number | undefined {
  if (error instanceof CommanderError) return error.exitCode;
  if (typeof error !== "object" || error === null) return undefined;
  if ("exitCode" in error && typeof error.exitCode === "number") return error.exitCode;
  if (!("message" in error) || typeof error.message !== "string") return undefined;

  const match = /^process\.exit unexpectedly called with "(\d+)"$/u.exec(error.message);
  if (match === null) return undefined;

  return Number(match[1]);
}
