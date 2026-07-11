import { CommanderError } from "commander";
import { execa } from "execa";
import { cp, mkdir, symlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { expect } from "vitest";

import type { Domain } from "@/domains/types";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { createValidationDomain, type ValidationCliDependencies, validationDomain } from "@/interfaces/cli/validation";
import {
  VALIDATION_EMPTY_CLI_OPERAND,
  VALIDATION_OPTION_OPERAND_SEPARATOR,
  validationCliDefinition,
} from "@/interfaces/cli/validation-contract";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import {
  VALIDATION_SUBPROCESS_SCENARIO_KIND,
  type ValidationSubprocessScenario,
} from "@testing/generators/validation/validation";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { type FixtureName, HARNESS_TIMEOUT, PROJECT_FIXTURES } from "@testing/harnesses/with-validation-env";

const HEX_RADIX = 16;
const HEX_ESCAPE_WIDTH = 2;
const LAST_ASCII_CONTROL_CODE_POINT = 0x1f;
const DELETE_CONTROL_CODE_POINT = 0x7f;
const CONTROL_ESCAPE_PREFIX = `${String.fromCodePoint(0x5c)}x`;
const VALIDATION_CLI_TEMP_PREFIX = "spx-validation-cli-";
const VALIDATION_SUBPROCESS_TIMEOUT = 15_000;
export const VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT = 120_000;
export const VALIDATION_REPEATED_PIPELINE_TIMEOUT = VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT * 2;
const PROCESS_EXIT_UNAVAILABLE = -1;
const PACKAGED_CLI_FILENAME = "spx.js";

export interface ValidationCliResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

export interface ValidationSubprocessHarnessOptions {
  readonly fixture: FixtureName;
  readonly timeout: number;
}

export function validationSubprocessHarnessOptions(
  scenario: ValidationSubprocessScenario,
): ValidationSubprocessHarnessOptions {
  switch (scenario.kind) {
    case VALIDATION_SUBPROCESS_SCENARIO_KIND.LINT_CLEAN_PROJECT:
      return { fixture: PROJECT_FIXTURES.CLEAN_PROJECT, timeout: HARNESS_TIMEOUT };
    case VALIDATION_SUBPROCESS_SCENARIO_KIND.LINT_PYTHON_PROJECT:
    case VALIDATION_SUBPROCESS_SCENARIO_KIND.ALL_PYTHON_PROJECT:
      return { fixture: PROJECT_FIXTURES.PYTHON_PROJECT, timeout: HARNESS_TIMEOUT };
    case VALIDATION_SUBPROCESS_SCENARIO_KIND.LINT_BARE_PROJECT:
      return { fixture: PROJECT_FIXTURES.BARE_PROJECT, timeout: HARNESS_TIMEOUT };
    case VALIDATION_SUBPROCESS_SCENARIO_KIND.LINT_MISSING_CONFIG:
      return { fixture: PROJECT_FIXTURES.TYPESCRIPT_NO_ESLINT, timeout: HARNESS_TIMEOUT };
    case VALIDATION_SUBPROCESS_SCENARIO_KIND.ALL_CLEAN_PROJECT:
      return {
        fixture: PROJECT_FIXTURES.CLEAN_PROJECT,
        timeout: VALIDATION_PIPELINE_SUBPROCESS_TIMEOUT,
      };
  }
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

function packagedValidationCliPath(): string {
  return resolve(CONFIG_PROCESS_CWD.read(), PACKAGED_BIN_DIRECTORY, PACKAGED_CLI_FILENAME);
}

export async function runValidationSubprocess(
  args: readonly string[],
  options: ValidationCliRunOptions = {},
): Promise<ValidationCliResult> {
  const result = await execa(process.execPath, validationCliPackagedArgs(args, options.executablePath), {
    cwd: options.cwd,
    reject: false,
    timeout: options.timeout ?? VALIDATION_SUBPROCESS_TIMEOUT,
  });
  return {
    exitCode: result.exitCode ?? PROCESS_EXIT_UNAVAILABLE,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

export function withIsolatedPackagedValidationCli(
  testFn: (fixture: IsolatedPackagedValidationCli) => Promise<void>,
): Promise<void> {
  return withTempDir(VALIDATION_CLI_TEMP_PREFIX, async (packageRoot) => {
    const sourceExecutablePath = packagedValidationCliPath();
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
      exitCode: VALIDATION_EMPTY_CLI_OPERAND.length,
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
  return withTempDir(VALIDATION_CLI_TEMP_PREFIX, testFn);
}

export function validationCliPackagedArgs(args: readonly string[], executablePath?: string): string[] {
  return [executablePath ?? packagedValidationCliPath(), validationCliDefinition.domain.commandName, ...args];
}

export function validationCliOptionName(option: ValidationCliOptionDefinition): string {
  const name = option.flag.split(VALIDATION_OPTION_OPERAND_SEPARATOR).at(0);
  return name ?? option.flag;
}

export function validationCliEmptyOutput(): string {
  return validationCliDefinition.domain.commandName.slice(
    VALIDATION_EMPTY_CLI_OPERAND.length,
    VALIDATION_EMPTY_CLI_OPERAND.length,
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
  expect(recorder.calls).toHaveLength(VALIDATION_EMPTY_CLI_OPERAND.length);
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
  scenario: Omit<ValidationSubprocessScenario, "kind">,
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
