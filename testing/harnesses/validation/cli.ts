import { CommanderError } from "commander";
import { execa } from "execa";
import { symlink } from "node:fs/promises";
import { expect } from "vitest";

import { LITERAL_PROBLEM_KIND, VALIDATION_COMMAND_OUTPUT, type ValidationCommandResult } from "@/commands/validation";
import { formatTypeScriptAbsentSkipMessage, VALIDATION_STAGE_DISPLAY_NAMES } from "@/commands/validation/messages";
import type { Domain } from "@/domains/types";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import {
  allValidationCliOptions,
  createValidationDomain,
  literalValidationCliOptions,
  validationCliDefinition,
  type ValidationCommandHandlers,
  validationDomain,
} from "@/interfaces/cli/validation";
import { sanitizeCliArgument, SENTINEL_EMPTY } from "@/lib/sanitize-cli-argument";
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

export interface ValidationCliResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

export interface ValidationCliRunOptions {
  readonly cwd?: string;
  readonly timeout?: number;
}

export interface ValidationInProcessRunOptions {
  readonly cwd?: string;
  readonly domains?: readonly Domain[];
}

export interface ValidationCliOptionDefinition {
  readonly flag: string;
}

export interface RecordedValidationCliResult extends ValidationCliResult {
  readonly handlerCalls: readonly string[];
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

export async function runValidationInProcess(
  args: readonly string[],
  options: ValidationInProcessRunOptions = {},
): Promise<ValidationCliResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const cwd = options.cwd;
  const program = createCliProgram({
    domains: options.domains ?? [validationDomain],
    ...(cwd === undefined ? {} : { processCwd: () => cwd }),
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

async function runValidationInProcessWithRecording(
  args: readonly string[],
  options: Omit<ValidationInProcessRunOptions, "domains"> = {},
): Promise<RecordedValidationCliResult> {
  const handlerCalls: string[] = [];
  const result = await runValidationInProcess(args, {
    ...options,
    domains: [createRecordingValidationDomain(handlerCalls)],
  });
  return { ...result, handlerCalls };
}

function createRecordingValidationDomain(handlerCalls: string[]): Domain {
  const recordHandler = (handlerName: string): ValidationCommandResult & { readonly durationMs: number } => {
    handlerCalls.push(handlerName);
    return {
      durationMs: validationCliEmptyOutputLength(),
      exitCode: validationCliEmptyOutputLength(),
      output: validationCliEmptyOutput(),
    };
  };
  const handlers: ValidationCommandHandlers = {
    typescript: async () => recordHandler(validationCliDefinition.subcommands.typescript.commandName),
    lint: async () => recordHandler(validationCliDefinition.subcommands.lint.commandName),
    circular: async () => recordHandler(validationCliDefinition.subcommands.circular.commandName),
    knip: async () => recordHandler(validationCliDefinition.subcommands.knip.commandName),
    literal: async () => recordHandler(validationCliDefinition.subcommands.literal.commandName),
    markdown: async () => recordHandler(validationCliDefinition.subcommands.markdown.commandName),
    formatting: async () => recordHandler(validationCliDefinition.subcommands.format.commandName),
    all: async () => recordHandler(validationCliDefinition.subcommands.all.commandName),
    allowlistExisting: async () => recordHandler(literalValidationCliOptions.allowlistExisting.flag),
  };
  return createValidationDomain(handlers);
}

function expectNoValidationHandlerCalls(result: RecordedValidationCliResult): void {
  expect(result.handlerCalls).toEqual([]);
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

export async function assertRegisteredSubcommandRunsHandler(): Promise<void> {
  await withEmptyValidationProject(async (productRoot) => {
    const result = await runValidationSubprocess(
      [
        validationCliDefinition.subcommands.literal.commandName,
        literalValidationCliOptions.filesWithProblems.flag,
      ],
      { cwd: productRoot },
    );

    expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
    expect(result.stdout).toContain(formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.LITERAL));
    expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
  });
}

export async function assertValidationAllRunsAgainstProductTree(): Promise<void> {
  const result = await runValidationSubprocess(
    [
      validationCliDefinition.subcommands.all.commandName,
      allValidationCliOptions.skipCircular.flag,
      allValidationCliOptions.skipLiteral.flag,
      VALIDATION_PIPELINE_DATA.productTreeMarkdownOperand,
    ],
    { timeout: VALIDATION_PIPELINE_DATA.allTimeout },
  );

  expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(result.stdout).toContain(VALIDATION_COMMAND_OUTPUT.MARKDOWN_NO_ISSUES);
  expect(result.stdout).toContain(VALIDATION_COMMAND_OUTPUT.FORMATTING_NO_ISSUES);
  expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
}

export async function assertRegisteredSubcommandPropagatesHandlerExitCode(): Promise<void> {
  await withEmptyValidationProject(async (productRoot) => {
    const unsafeKind = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.invalidLiteralProblemKind());
    const result = await runValidationSubprocess(
      [
        validationCliDefinition.subcommands.literal.commandName,
        validationCliOptionName(literalValidationCliOptions.kind),
        unsafeKind,
      ],
      { cwd: productRoot },
    );

    expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownLiteralProblemKind.exitCode);
    expect(result.stdout).toBe(validationCliEmptyOutput());
    expect(result.stderr).toContain(validationCliDefinition.diagnostics.unknownLiteralProblemKind.messageLabel);
    expect(result.stderr).toContain(sanitizeCliArgument(unsafeKind));
    expect(result.stderr).not.toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
  });
}

export async function assertEscapingPathOperandsRejectBeforeValidation(): Promise<void> {
  await withEmptyValidationProject(async (productRoot) => {
    const result = await runValidationInProcessWithRecording(
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
    expectNoValidationHandlerCalls(result);
  });
}

export async function assertSymlinkedInvocationDirectoryAcceptsInProductOperand(): Promise<void> {
  await withEmptyValidationProject(async (productRoot) => {
    const symlinkRoot = `${productRoot}-link`;
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

export async function assertUnknownSubcommandReportsSanitizedDiagnostic(): Promise<void> {
  const unknownStage = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.unknownSubcommand());
  const result = await runValidationInProcessWithRecording([unknownStage]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  expect(result.stderr).toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
  expect(result.stderr).toContain(unknownStage);
  expectNoValidationHandlerCalls(result);
}

export async function assertEmptyArgumentReportsSentinel(): Promise<void> {
  const result = await runValidationSubprocess([
    sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.emptyArgument()),
  ]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  expect(result.stderr).toContain(SENTINEL_EMPTY);
}

export async function assertControlCharactersAreEscaped(): Promise<void> {
  const unsafeArgument = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.controlArgument());
  const result = await runValidationSubprocess([unsafeArgument]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  expect(result.stderr).toContain(sanitizeCliArgument(unsafeArgument));
  expect(result.stderr).not.toContain(unsafeArgument);
}

export async function assertUnicodeArgumentsArePreserved(): Promise<void> {
  const unicodeArgument = sampleLiteralTestValue(VALIDATION_CLI_GENERATOR.unicodeArgument());
  const result = await runValidationSubprocess([unicodeArgument]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  expect(result.stderr).toContain(unicodeArgument);
}

export async function assertLiteralHelpListsLiteralFlags(): Promise<void> {
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

export async function assertValidationAllHelpListsSkipFlags(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.all.commandName,
    validationCliDefinition.commanderHelpOperands.longFlag,
  ]);

  expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(result.stderr).toHaveLength(validationCliEmptyOutputLength());
  expect(result.stdout).toContain(allValidationCliOptions.skipCircular.flag);
  expect(result.stdout).toContain(allValidationCliOptions.skipLiteral.flag);
}

export async function assertLiteralHelpOmitsFullPipelineSkipFlags(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.literal.commandName,
    validationCliDefinition.commanderHelpOperands.longFlag,
  ]);

  expect(result.exitCode).toBeLessThan(validationCliSuccessExitCodeUpperBound());
  expect(result.stderr).toHaveLength(validationCliEmptyOutputLength());
  expect(result.stdout).not.toContain(allValidationCliOptions.skipCircular.flag);
  expect(result.stdout).not.toContain(allValidationCliOptions.skipLiteral.flag);
}

export async function assertLiteralCommandRejectsFullPipelineLiteralSkipFlag(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.literal.commandName,
    allValidationCliOptions.skipLiteral.flag,
  ]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  expect(result.stdout).toBe(validationCliEmptyOutput());
  expect(result.stderr).toContain(allValidationCliOptions.skipLiteral.flag);
}

export async function assertCircularCommandRejectsFullPipelineCircularSkipFlag(): Promise<void> {
  const result = await runValidationInProcess([
    validationCliDefinition.subcommands.circular.commandName,
    allValidationCliOptions.skipCircular.flag,
  ]);

  expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  expect(result.stdout).toBe(validationCliEmptyOutput());
  expect(result.stderr).toContain(allValidationCliOptions.skipCircular.flag);
}

export async function assertUnknownSubcommandProperty(): Promise<void> {
  await assertProperty(
    VALIDATION_CLI_GENERATOR.unknownSubcommand(),
    async (candidate) => {
      const result = await runValidationInProcessWithRecording([candidate]);

      expect(result.exitCode).toBe(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
      expect(result.stderr).toContain(validationCliDefinition.diagnostics.unknownSubcommand.messageLabel);
      expectNoValidationHandlerCalls(result);
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
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

function commanderExitCode(error: unknown): number | undefined {
  if (error instanceof CommanderError) return error.exitCode;
  if (typeof error !== "object" || error === null) return undefined;
  if ("exitCode" in error && typeof error.exitCode === "number") return error.exitCode;
  if (!("message" in error) || typeof error.message !== "string") return undefined;

  const match = /^process\.exit unexpectedly called with "(\d+)"$/u.exec(error.message);
  if (match === null) return undefined;

  return Number(match[1]);
}
