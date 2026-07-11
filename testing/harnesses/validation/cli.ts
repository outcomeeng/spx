import { CommanderError } from "commander";
import { execa } from "execa";
import { describe, expect, it } from "vitest";

import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { validationCliDefinition, validationDomain } from "@/interfaces/cli/validation";
import { sampleLiteralTestValue } from "@testing/generators/literal/literal";
import {
  VALIDATION_CLI_GENERATOR,
  validationAllTypeScriptSubprocessScenarios,
  validationCliEmptyOutputLength,
  validationCliOptionOperandSeparator,
  validationCliPackagedExecutablePath,
  validationCliTempDirectoryPrefix,
  validationCliUnavailableExitCode,
  type ValidationSubprocessScenario,
} from "@testing/generators/validation/validation";
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

function commanderExitCode(error: unknown): number | undefined {
  if (error instanceof CommanderError) return error.exitCode;
  if (typeof error !== "object" || error === null) return undefined;
  if ("exitCode" in error && typeof error.exitCode === "number") return error.exitCode;
  if (!("message" in error) || typeof error.message !== "string") return undefined;

  const match = /^process\.exit unexpectedly called with "(\d+)"$/u.exec(error.message);
  if (match === null) return undefined;

  return Number(match[1]);
}
