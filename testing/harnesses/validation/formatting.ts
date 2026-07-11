/**
 * Formatting validation driver harness.
 *
 * Runs the dprint formatting stage's scenarios against hermetic temp fixtures
 * that carry a copy of the product's `dprint.jsonc` (so the pinned, cached
 * plugins resolve) and invoke the real `dprint` binary from `PATH`. The clean
 * fixture is canonicalized with `dprint fmt` so the pass case never depends on
 * the surrounding repository's formatting state.
 */

import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";

import { parse as parseJsonc } from "jsonc-parser";
import { expect } from "vitest";
import { stringify } from "yaml";

import { allCommand } from "@/commands/validation/all";
import { FORMATTING_COMMAND_OUTPUT, formattingCommand } from "@/commands/validation/formatting";
import type { ValidationCommandResult } from "@/commands/validation/types";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import {
  FORMATTING_SCENARIO_KIND,
  FORMATTING_VALIDATION_DATA,
  formattingScenarios,
  type FormattingValidationScenario,
} from "@testing/generators/validation/formatting";
import { runValidationSubprocess } from "@testing/harnesses/validation/cli";
import { collectHarnessTestCases, describe, it } from "@testing/harnesses/vitest-registration";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const execFileAsync = promisify(execFile);

const DPRINT_COMMAND_NAME = "dprint";
const DPRINT_FORMAT_SUBCOMMAND = "fmt";
const FORMATTING_TEMP_PREFIX = "dprint-validation-";
const FORMATTING_HARNESS_TIMEOUT = 30_000;

export const formattingValidationScenarioCases = collectHarnessTestCases(() => {
  describe("dprint formatting validation scenarios", () => {
    for (const scenario of formattingScenarios()) {
      it(
        scenario.title,
        () => runFormattingScenario(scenario),
        FORMATTING_HARNESS_TIMEOUT,
      );
    }
  });
});

interface FormattingFixture {
  readonly projectRoot: string;
  readonly sourceFile: string;
}

/** The parsed contract of the product's tracked `dprint.jsonc`. */
export interface ProductDprintConfig {
  readonly includes: string[];
  readonly excludes: string[];
  readonly plugins: string[];
  /** Extensions enumerated by the includes brace-glob (e.g. `ts`, `json`). */
  readonly includedExtensions: Set<string>;
}

const BRACE_OPEN = "{";
const BRACE_CLOSE = "}";

export function runFormattingScenario(scenario: FormattingValidationScenario): Promise<void> {
  switch (scenario.kind) {
    case FORMATTING_SCENARIO_KIND.CLEAN_PROJECT:
      return runCleanProjectScenario();
    case FORMATTING_SCENARIO_KIND.UNFORMATTED_COMMAND:
      return runUnformattedCommandScenario();
    case FORMATTING_SCENARIO_KIND.PIPELINE_FAILURE:
      return runPipelineFailureScenario();
    case FORMATTING_SCENARIO_KIND.CLI_PROCESS_UNFORMATTED:
      return runCliProcessScenario();
    case FORMATTING_SCENARIO_KIND.CLI_PROCESS_DIRECTORY_SCOPE:
      return runCliProcessDirectoryScopeScenario();
    case FORMATTING_SCENARIO_KIND.CLI_PROCESS_INVOCATION_DIRECTORY_SCOPE:
      return runCliProcessInvocationDirectoryScopeScenario();
    case FORMATTING_SCENARIO_KIND.CLI_PROCESS_DIRECTORY_INCLUDE_SCOPE:
      return runCliProcessDirectoryIncludeScopeScenario();
    case FORMATTING_SCENARIO_KIND.CLI_PROCESS_EXCLUDED_FILE_SCOPE:
      return runCliProcessExcludedFileScopeScenario();
    case FORMATTING_SCENARIO_KIND.CLI_PROCESS_FILTERED_DIRECTORY_SCOPE:
      return runCliProcessFilteredDirectoryScopeScenario();
    case FORMATTING_SCENARIO_KIND.CLI_PROCESS_EXCLUDED_DIRECTORY_SCOPE:
      return runCliProcessExcludedDirectoryScopeScenario();
    case FORMATTING_SCENARIO_KIND.GITIGNORE_SKIP:
      return runGitignoreSkipScenario();
  }
}

async function runCleanProjectScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.formattableTypeScriptContent, async (fixture) => {
    await canonicalizeFixture(fixture.projectRoot, fixture.sourceFile);

    const result = await formattingCommand({ cwd: fixture.projectRoot });

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.passExitCode);
  });
}

async function runUnformattedCommandScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent, async (fixture) => {
    const result = await formattingCommand({ cwd: fixture.projectRoot });

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.failureExitCode);
    expect(result.output).toContain(FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
  });
}

async function runPipelineFailureScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent, async (fixture) => {
    const result = await allCommand({ cwd: fixture.projectRoot, quiet: true });

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.failureExitCode);
  });
}

async function runCliProcessScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent, async (fixture) => {
    const result = await runValidationSubprocess(
      [
        validationCliDefinition.subcommands.format.commandName,
        FORMATTING_VALIDATION_DATA.typeScriptSourceFilename,
      ],
      { cwd: fixture.projectRoot },
    );

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.failureExitCode);
    expect(result.stdout).toContain(FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
  });
}

async function runCliProcessDirectoryScopeScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent, async (fixture) => {
    const result = await runValidationSubprocess(
      [
        validationCliDefinition.subcommands.format.commandName,
        ".",
      ],
      { cwd: fixture.projectRoot },
    );

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.failureExitCode);
    expect(result.stdout).toContain(FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
  });
}

async function runCliProcessInvocationDirectoryScopeScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.formattableTypeScriptContent, async (fixture) => {
    await initializeGitProductRoot(fixture.projectRoot);
    const sourceDirectory = join(fixture.projectRoot, FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName);
    await mkdir(sourceDirectory);
    await writeFile(
      join(fixture.projectRoot, FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath),
      FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent,
    );

    const result = await runValidationSubprocess(
      [
        validationCliDefinition.subcommands.format.commandName,
        FORMATTING_VALIDATION_DATA.typeScriptSourceFilename,
      ],
      { cwd: sourceDirectory },
    );

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.failureExitCode);
    expect(result.stdout).toContain(FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath);
  });
}

async function runCliProcessDirectoryIncludeScopeScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent, async (fixture) => {
    const sourceDirectory = join(fixture.projectRoot, FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName);
    await mkdir(sourceDirectory);
    await writeFile(
      join(fixture.projectRoot, FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath),
      FORMATTING_VALIDATION_DATA.formattableTypeScriptContent,
    );
    await writeFile(
      join(fixture.projectRoot, FORMATTING_VALIDATION_DATA.validationConfigFilename),
      stringify({
        validation: {
          paths: {
            include: [FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName],
          },
        },
      }),
    );

    const result = await runValidationSubprocess(
      [
        validationCliDefinition.subcommands.format.commandName,
        ".",
      ],
      { cwd: fixture.projectRoot },
    );

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.passExitCode);
    expect(result.stdout).toContain(FORMATTING_COMMAND_OUTPUT.NO_ISSUES);
    expect(result.stdout).not.toContain(FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
  });
}

async function runCliProcessExcludedFileScopeScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.formattableTypeScriptContent, async (fixture) => {
    const sourceDirectory = join(fixture.projectRoot, FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName);
    await mkdir(sourceDirectory);
    await writeFile(
      join(fixture.projectRoot, FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath),
      FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent,
    );
    await writeFile(
      join(fixture.projectRoot, FORMATTING_VALIDATION_DATA.validationConfigFilename),
      stringify({
        validation: {
          paths: {
            exclude: [FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName],
          },
        },
      }),
    );

    const result = await runValidationSubprocess(
      [
        validationCliDefinition.subcommands.format.commandName,
        FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath,
      ],
      { cwd: fixture.projectRoot },
    );

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.failureExitCode);
    expect(result.stdout).toContain(FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath);
  });
}

async function runCliProcessFilteredDirectoryScopeScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.formattableTypeScriptContent, async (fixture) => {
    const sourceDirectory = join(fixture.projectRoot, FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName);
    await mkdir(sourceDirectory);
    await writeFile(
      join(fixture.projectRoot, FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath),
      FORMATTING_VALIDATION_DATA.formattableTypeScriptContent,
    );
    const secondaryDirectory = join(fixture.projectRoot, FORMATTING_VALIDATION_DATA.secondaryScopeDirectoryName);
    await mkdir(secondaryDirectory);
    await writeFile(
      join(fixture.projectRoot, FORMATTING_VALIDATION_DATA.secondaryScopeTypeScriptSourcePath),
      FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent,
    );
    await writeFile(
      join(fixture.projectRoot, FORMATTING_VALIDATION_DATA.validationConfigFilename),
      stringify({
        validation: {
          paths: {
            include: [
              FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName,
              FORMATTING_VALIDATION_DATA.secondaryScopeDirectoryName,
            ],
          },
        },
      }),
    );

    const result = await runValidationSubprocess(
      [
        validationCliDefinition.subcommands.format.commandName,
        FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName,
      ],
      { cwd: fixture.projectRoot },
    );

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.passExitCode);
    expect(result.stdout).toContain(FORMATTING_COMMAND_OUTPUT.NO_ISSUES);
    expect(result.stdout).not.toContain(FORMATTING_VALIDATION_DATA.secondaryScopeTypeScriptSourcePath);
  });
}

async function runCliProcessExcludedDirectoryScopeScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.formattableTypeScriptContent, async (fixture) => {
    const sourceDirectory = join(fixture.projectRoot, FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName);
    await mkdir(sourceDirectory);
    await writeFile(
      join(fixture.projectRoot, FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath),
      FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent,
    );
    const excludedDirectory = join(
      sourceDirectory,
      FORMATTING_VALIDATION_DATA.excludedScopeDirectoryName,
    );
    await mkdir(excludedDirectory);
    await writeFile(
      join(fixture.projectRoot, FORMATTING_VALIDATION_DATA.excludedScopeTypeScriptSourcePath),
      FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent,
    );
    await writeFile(
      join(fixture.projectRoot, FORMATTING_VALIDATION_DATA.validationConfigFilename),
      stringify({
        validation: {
          paths: {
            include: [FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName],
            exclude: [
              `${FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName}/${FORMATTING_VALIDATION_DATA.excludedScopeDirectoryName}`,
            ],
          },
        },
      }),
    );

    const result = await runValidationSubprocess(
      [
        validationCliDefinition.subcommands.format.commandName,
        FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName,
      ],
      { cwd: fixture.projectRoot },
    );

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.failureExitCode);
    expect(result.stdout).toContain(FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath);
    expect(result.stdout).not.toContain(FORMATTING_VALIDATION_DATA.excludedScopeTypeScriptSourcePath);
  });
}

async function runGitignoreSkipScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent, async (fixture) => {
    await writeFile(
      join(fixture.projectRoot, FORMATTING_VALIDATION_DATA.gitignoreFilename),
      `${FORMATTING_VALIDATION_DATA.typeScriptSourceFilename}\n`,
    );

    const result = await formattingCommand({ cwd: fixture.projectRoot });

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.passExitCode);
  });
}

/**
 * Run the formatting command against a temp project that has no `dprint.jsonc`.
 *
 * The project carries an unformatted file but no config, so the stage must skip
 * rather than let a personal global dprint config decide the verdict.
 */
export function runFormattingWithoutConfig(): Promise<ValidationCommandResult> {
  return withTempDir(FORMATTING_TEMP_PREFIX, async (projectRoot) => {
    await writeFile(
      join(projectRoot, FORMATTING_VALIDATION_DATA.typeScriptSourceFilename),
      FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent,
    );
    return formattingCommand({ cwd: projectRoot });
  });
}

/**
 * Read and parse the product's tracked `dprint.jsonc`.
 *
 * The product directory defaults to the current working directory, which the
 * vitest runner sets to the product root. The mapping and compliance evidence
 * asserts against the parsed includes, excludes, and plugin pins.
 */
export function loadProductDprintConfig(productRoot: string = process.cwd()): ProductDprintConfig {
  const configPath = join(productRoot, FORMATTING_VALIDATION_DATA.dprintConfigFilename);
  const parsed = parseJsonc(readFileSync(configPath, "utf8")) as {
    includes?: string[];
    excludes?: string[];
    plugins?: string[];
  };
  const includes = parsed.includes ?? [];
  return {
    includes,
    excludes: parsed.excludes ?? [],
    plugins: parsed.plugins ?? [],
    includedExtensions: extensionsFromGlobs(includes),
  };
}

function extensionsFromGlobs(patterns: string[]): Set<string> {
  const extensions = new Set<string>();
  for (const pattern of patterns) {
    const open = pattern.indexOf(BRACE_OPEN);
    const close = pattern.indexOf(BRACE_CLOSE, open + 1);
    if (open < 0 || close < 0) continue;
    for (const token of pattern.slice(open + 1, close).split(",")) {
      extensions.add(token.trim());
    }
  }
  return extensions;
}

async function withFormattingFixture(
  sourceContent: string,
  callback: (fixture: FormattingFixture) => Promise<void>,
): Promise<void> {
  await withTempDir(FORMATTING_TEMP_PREFIX, async (projectRoot) => {
    copyProductDprintConfig(projectRoot);
    const sourceFile = join(projectRoot, FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
    await writeFile(sourceFile, sourceContent);
    await callback({ projectRoot, sourceFile });
  });
}

function copyProductDprintConfig(projectRoot: string): void {
  const source = readFileSync(
    join(process.cwd(), FORMATTING_VALIDATION_DATA.dprintConfigFilename),
    "utf8",
  );
  writeFileSync(join(projectRoot, FORMATTING_VALIDATION_DATA.dprintConfigFilename), source);
}

async function canonicalizeFixture(projectRoot: string, sourceFile: string): Promise<void> {
  await execFileAsync(DPRINT_COMMAND_NAME, [DPRINT_FORMAT_SUBCOMMAND, basename(sourceFile)], {
    cwd: projectRoot,
  });
}

async function initializeGitProductRoot(productRoot: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd: productRoot });
}
