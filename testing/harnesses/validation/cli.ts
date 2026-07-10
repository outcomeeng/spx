import { CommanderError } from "commander";
import { execa } from "execa";
import { cp, mkdir, symlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { expect } from "vitest";

import type { Domain } from "@/domains/types";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { createValidationDomain, type ValidationCliDependencies, validationDomain } from "@/interfaces/cli/validation";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { sampleLiteralTestValue } from "@testing/generators/literal/literal";
import {
  VALIDATION_CLI_GENERATOR,
  validationCliEmptyOutputLength,
  validationCliOptionOperandSeparator,
  validationCliPackagedExecutablePath,
  validationCliTempDirectoryPrefix,
  validationCliUnavailableExitCode,
  type ValidationSubprocessScenario,
} from "@testing/generators/validation/validation";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const HEX_RADIX = 16;
const HEX_ESCAPE_WIDTH = 2;
const LAST_ASCII_CONTROL_CODE_POINT = 0x1f;
const DELETE_CONTROL_CODE_POINT = 0x7f;
const CONTROL_ESCAPE_PREFIX = `${String.fromCodePoint(0x5c)}x`;

export interface ValidationCliResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

export interface ValidationCliRunOptions {
  readonly cwd?: string;
  readonly executablePath?: string;
  readonly timeout?: number;
}

export interface ValidationInProcessOptions {
  readonly domain?: Domain;
  readonly processCwd?: () => string;
  readonly writeStdout?: (output: string) => void;
}

export interface ValidationHandlerCall {
  readonly commandName: string;
  readonly options: Readonly<Record<string, unknown>>;
}

export interface RecordingValidationDomain {
  readonly calls: readonly ValidationHandlerCall[];
  readonly domain: Domain;
}

export interface ValidationCliOptionDefinition {
  readonly flag: string;
}

export interface IsolatedPackagedValidationCli {
  readonly executablePath: string;
}

const PACKAGED_BIN_DIRECTORY = "bin";
const PACKAGED_DIST_DIRECTORY = "dist";
const PACKAGE_MANIFEST_FILENAME = "package.json";
const PACKAGE_DEPENDENCIES_DIRECTORY = "node_modules";

export async function runValidationSubprocess(
  args: readonly string[],
  options: ValidationCliRunOptions = {},
): Promise<ValidationCliResult> {
  const result = await execa(process.execPath, validationCliPackagedArgs(args, options.executablePath), {
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

export function withIsolatedPackagedValidationCli(
  testFn: (fixture: IsolatedPackagedValidationCli) => Promise<void>,
): Promise<void> {
  return withTempDir(validationCliTempDirectoryPrefix(), async (packageRoot) => {
    const sourceExecutablePath = validationCliPackagedExecutablePath();
    const sourceProductRoot = dirname(dirname(sourceExecutablePath));
    const binDirectory = join(packageRoot, PACKAGED_BIN_DIRECTORY);
    const executablePath = join(binDirectory, basename(sourceExecutablePath));
    await mkdir(binDirectory, { recursive: true });
    await cp(sourceExecutablePath, executablePath);
    await cp(
      join(sourceProductRoot, PACKAGED_DIST_DIRECTORY),
      join(packageRoot, PACKAGED_DIST_DIRECTORY),
      { recursive: true },
    );
    await cp(
      join(sourceProductRoot, PACKAGE_MANIFEST_FILENAME),
      join(packageRoot, PACKAGE_MANIFEST_FILENAME),
    );
    await symlink(
      join(sourceProductRoot, PACKAGE_DEPENDENCIES_DIRECTORY),
      join(packageRoot, PACKAGE_DEPENDENCIES_DIRECTORY),
      "dir",
    );
    await testFn({ executablePath });
  });
}

export async function runValidationInProcess(
  args: readonly string[],
  options: ValidationInProcessOptions = {},
): Promise<ValidationCliResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const program = createCliProgram({
    domains: [options.domain ?? validationDomain],
    processCwd: options.processCwd,
    writeStdout: (output) => {
      stdout.push(output);
      options.writeStdout?.(output);
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

export function validationCliPackagedArgs(args: readonly string[], executablePath?: string): string[] {
  return [executablePath ?? validationCliPackagedExecutablePath(), validationCliDefinition.domain.commandName, ...args];
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

export function expectedEscapedControlArgument(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (
      codePoint === undefined
      || (codePoint > LAST_ASCII_CONTROL_CODE_POINT && codePoint !== DELETE_CONTROL_CODE_POINT)
    ) {
      return character;
    }
    return CONTROL_ESCAPE_PREFIX + codePoint.toString(HEX_RADIX).padStart(HEX_ESCAPE_WIDTH, "0");
  }).join("");
}

export async function expectValidationDispatchFailureInvokesNoHandler(
  args: readonly string[],
  options: ValidationInProcessOptions = {},
): Promise<ValidationCliResult> {
  const recorder = createRecordingValidationDomain(validationCliDefinition.diagnostics.unknownSubcommand.exitCode);
  const result = await runValidationInProcess(args, { ...options, domain: recorder.domain });
  expect(recorder.calls).toHaveLength(validationCliEmptyOutputLength());
  return result;
}

export function createRecordingValidationDomain(exitCode: number): RecordingValidationDomain {
  const calls: ValidationHandlerCall[] = [];
  const record = (
    commandName: string,
    options: Readonly<Record<string, unknown>>,
  ) => {
    calls.push({ commandName, options });
    return Promise.resolve({ exitCode, output: "", durationMs: 0 });
  };
  const dependencies: ValidationCliDependencies = {
    allCommand: (options) => record(validationCliDefinition.subcommands.all.commandName, { ...options }),
    allowlistExisting: (options) => record(validationCliDefinition.subcommands.literal.commandName, { ...options }),
    circularCommand: (options) => record(validationCliDefinition.subcommands.circular.commandName, { ...options }),
    formattingCommand: (options) => record(validationCliDefinition.subcommands.format.commandName, { ...options }),
    knipCommand: (options) => record(validationCliDefinition.subcommands.knip.commandName, { ...options }),
    lintCommand: (options) => record(validationCliDefinition.subcommands.lint.commandName, { ...options }),
    literalCommand: (options) => record(validationCliDefinition.subcommands.literal.commandName, { ...options }),
    markdownCommand: (options) => record(validationCliDefinition.subcommands.markdown.commandName, { ...options }),
    typescriptCommand: (options) => record(validationCliDefinition.subcommands.typescript.commandName, { ...options }),
  };
  return { calls, domain: createValidationDomain(dependencies) };
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
