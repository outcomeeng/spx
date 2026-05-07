import { Command, CommanderError } from "commander";
import { execa } from "execa";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";

import { validationCliDefinition, validationDomain } from "@/domains/validation";
import { sampleLiteralTestValue } from "@testing/generators/literal/literal";
import {
  VALIDATION_CLI_GENERATOR,
  validationCliCommanderArgvPrefix,
  validationCliCommanderParseSource,
  validationCliEmptyOutputLength,
  validationCliOptionOperandSeparator,
  validationCliPackagedExecutablePath,
  validationCliTempDirectoryPrefix,
  validationCliUnavailableExitCode,
  type ValidationSubprocessScenario,
} from "@testing/generators/validation/validation";

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

export async function runValidationInProcess(args: readonly string[]): Promise<ValidationCliResult> {
  const program = new Command();
  const stdout: string[] = [];
  const stderr: string[] = [];

  program.exitOverride();
  program.configureOutput({
    writeErr: (value) => stderr.push(value),
    writeOut: (value) => stdout.push(value),
  });
  validationDomain.register(program);

  try {
    await program.parseAsync(
      [...validationCliCommanderArgvPrefix(), ...args],
      { from: validationCliCommanderParseSource() },
    );
    return {
      exitCode: validationCliEmptyOutputLength(),
      stderr: stderr.join(validationCliEmptyOutput()),
      stdout: stdout.join(validationCliEmptyOutput()),
    };
  } catch (error) {
    if (isCommanderExit(error)) {
      return {
        exitCode: error.exitCode,
        stderr: stderr.join(validationCliEmptyOutput()),
        stdout: stdout.join(validationCliEmptyOutput()),
      };
    }
    throw error;
  }
}

export async function withEmptyValidationProject(
  testFn: (projectRoot: string) => Promise<void>,
): Promise<void> {
  const projectRoot = await mkdtemp(join(tmpdir(), validationCliTempDirectoryPrefix()));
  try {
    await testFn(projectRoot);
  } finally {
    await rm(projectRoot, { force: true, recursive: true });
  }
}

export function validationCliPackagedArgs(args: readonly string[]): string[] {
  return [validationCliPackagedExecutablePath(), validationCliDefinition.domain.commandName, ...args];
}

export function validationCliOptionName(option: ValidationCliOptionDefinition): string {
  const [name] = option.flag.split(validationCliOptionOperandSeparator());
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

function isCommanderExit(error: unknown): error is CommanderError {
  return error instanceof CommanderError;
}
