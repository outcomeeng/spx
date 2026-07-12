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
import { formattingValidationLanguage } from "@/validation/languages/formatting";
import { validationPipelineStages, validationRegistry } from "@/validation/registry";
import { buildDprintCheckArgs } from "@/validation/steps/formatting";
import {
  arbitraryDprintFileArguments,
  FORMATTING_SCENARIO_KIND,
  FORMATTING_VALIDATION_DATA,
  formattingScenarios,
  type FormattingValidationScenario,
} from "@testing/generators/validation/formatting";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
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

export function registerFormattingMappingEvidence(): void {
  describe("dprint formats the declared extensions and skips excluded paths", () => {
    const config = loadProductDprintConfig();
    for (const extension of FORMATTING_VALIDATION_DATA.formattedFileExtensions) {
      it(`includes .${extension} files`, () => {
        expect(config.includedExtensions.has(extension)).toBe(true);
      });
    }
    for (const path of FORMATTING_VALIDATION_DATA.neverFormattedPaths) {
      it(`excludes ${path}`, () => {
        expect(config.excludes.some((pattern) => pattern.includes(path))).toBe(true);
      });
    }
  });
}

export function registerFormattingPropertyEvidence(): void {
  describe("dprint argument construction", () => {
    it("is deterministic and preserves file and exclude scopes", () => {
      assertProperty(
        arbitraryDprintFileArguments().chain((excludes) =>
          arbitraryDprintFileArguments().map((files) => ({ excludes, files }))
        ),
        ({ excludes, files }) => {
          expect(buildDprintCheckArgs({ excludes, files })).toEqual(buildDprintCheckArgs({ excludes, files }));
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });
}

export function registerFormattingComplianceEvidence(): void {
  describe("formatting registry and configuration compliance", () => {
    it("composes the formatting descriptor into the full pipeline", () => {
      expect(validationRegistry.languages).toContain(formattingValidationLanguage);
      expect(validationPipelineStages).toEqual(expect.arrayContaining([...formattingValidationLanguage.stages]));
    });
    it("skips when the product has no dprint config", async () => {
      const result = await runFormattingWithoutConfig();
      expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.passExitCode);
      expect(result.output).toContain(FORMATTING_COMMAND_OUTPUT.NO_CONFIG_SKIP_REASON);
    });
  });
}

interface FormattingFixture {
  readonly productDir: string;
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
    await canonicalizeFixture(fixture.productDir, fixture.sourceFile);

    const result = await formattingCommand({ cwd: fixture.productDir });

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.passExitCode);
  });
}

async function runUnformattedCommandScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent, async (fixture) => {
    const result = await formattingCommand({ cwd: fixture.productDir });

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.failureExitCode);
    expect(result.output).toContain(FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
  });
}

async function runPipelineFailureScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent, async (fixture) => {
    const result = await allCommand({ cwd: fixture.productDir, quiet: true });

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
      { cwd: fixture.productDir },
    );

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.failureExitCode);
    expect(result.stderr).toContain(FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
  });
}

async function runCliProcessDirectoryScopeScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent, async (fixture) => {
    const result = await runValidationSubprocess(
      [
        validationCliDefinition.subcommands.format.commandName,
        ".",
      ],
      { cwd: fixture.productDir },
    );

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.failureExitCode);
    expect(result.stderr).toContain(FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
  });
}

async function runCliProcessInvocationDirectoryScopeScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.formattableTypeScriptContent, async (fixture) => {
    await initializeGitProductDir(fixture.productDir);
    const sourceDirectory = join(fixture.productDir, FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName);
    await mkdir(sourceDirectory);
    await writeFile(
      join(fixture.productDir, FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath),
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
    expect(result.stderr).toContain(FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath);
  });
}

async function runCliProcessDirectoryIncludeScopeScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent, async (fixture) => {
    const sourceDirectory = join(fixture.productDir, FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName);
    await mkdir(sourceDirectory);
    await writeFile(
      join(fixture.productDir, FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath),
      FORMATTING_VALIDATION_DATA.formattableTypeScriptContent,
    );
    await writeFile(
      join(fixture.productDir, FORMATTING_VALIDATION_DATA.validationConfigFilename),
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
      { cwd: fixture.productDir },
    );

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.failureExitCode);
    expect(result.stderr).toContain(FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
  });
}

async function runCliProcessExcludedFileScopeScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.formattableTypeScriptContent, async (fixture) => {
    const sourceDirectory = join(fixture.productDir, FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName);
    await mkdir(sourceDirectory);
    await writeFile(
      join(fixture.productDir, FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath),
      FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent,
    );
    await writeFile(
      join(fixture.productDir, FORMATTING_VALIDATION_DATA.validationConfigFilename),
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
      { cwd: fixture.productDir },
    );

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.failureExitCode);
    expect(result.stderr).toContain(FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath);
  });
}

async function runCliProcessFilteredDirectoryScopeScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.formattableTypeScriptContent, async (fixture) => {
    const sourceDirectory = join(fixture.productDir, FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName);
    await mkdir(sourceDirectory);
    await writeFile(
      join(fixture.productDir, FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath),
      FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent,
    );
    const secondaryDirectory = join(fixture.productDir, FORMATTING_VALIDATION_DATA.secondaryScopeDirectoryName);
    await mkdir(secondaryDirectory);
    await writeFile(
      join(fixture.productDir, FORMATTING_VALIDATION_DATA.secondaryScopeTypeScriptSourcePath),
      FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent,
    );
    await writeFile(
      join(fixture.productDir, FORMATTING_VALIDATION_DATA.validationConfigFilename),
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
      { cwd: fixture.productDir },
    );

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.failureExitCode);
    expect(result.stderr).toContain(FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath);
    expect(result.stderr).not.toContain(FORMATTING_VALIDATION_DATA.secondaryScopeTypeScriptSourcePath);
  });
}

async function runCliProcessExcludedDirectoryScopeScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.formattableTypeScriptContent, async (fixture) => {
    const sourceDirectory = join(fixture.productDir, FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName);
    await mkdir(sourceDirectory);
    await writeFile(
      join(fixture.productDir, FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath),
      FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent,
    );
    const excludedDirectory = join(
      sourceDirectory,
      FORMATTING_VALIDATION_DATA.excludedScopeDirectoryName,
    );
    await mkdir(excludedDirectory);
    await writeFile(
      join(fixture.productDir, FORMATTING_VALIDATION_DATA.excludedScopeTypeScriptSourcePath),
      FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent,
    );
    await writeFile(
      join(fixture.productDir, FORMATTING_VALIDATION_DATA.validationConfigFilename),
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
      { cwd: fixture.productDir },
    );

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.failureExitCode);
    expect(result.stderr).toContain(FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath);
    expect(result.stderr).toContain(FORMATTING_VALIDATION_DATA.excludedScopeTypeScriptSourcePath);
  });
}

async function runGitignoreSkipScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent, async (fixture) => {
    await writeFile(
      join(fixture.productDir, FORMATTING_VALIDATION_DATA.gitignoreFilename),
      `${FORMATTING_VALIDATION_DATA.typeScriptSourceFilename}\n`,
    );

    const result = await formattingCommand({ cwd: fixture.productDir });

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
  return withTempDir(FORMATTING_TEMP_PREFIX, async (productDir) => {
    await writeFile(
      join(productDir, FORMATTING_VALIDATION_DATA.typeScriptSourceFilename),
      FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent,
    );
    return formattingCommand({ cwd: productDir });
  });
}

/**
 * Read and parse the product's tracked `dprint.jsonc`.
 *
 * The product directory defaults to the current working directory, which the
 * vitest runner sets to the product root. The mapping and compliance evidence
 * asserts against the parsed includes, excludes, and plugin pins.
 */
export function loadProductDprintConfig(productDir: string = process.cwd()): ProductDprintConfig {
  const configPath = join(productDir, FORMATTING_VALIDATION_DATA.dprintConfigFilename);
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
  await withTempDir(FORMATTING_TEMP_PREFIX, async (productDir) => {
    copyProductDprintConfig(productDir);
    const sourceFile = join(productDir, FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
    await writeFile(sourceFile, sourceContent);
    await callback({ productDir, sourceFile });
  });
}

function copyProductDprintConfig(productDir: string): void {
  const source = readFileSync(
    join(process.cwd(), FORMATTING_VALIDATION_DATA.dprintConfigFilename),
    "utf8",
  );
  writeFileSync(join(productDir, FORMATTING_VALIDATION_DATA.dprintConfigFilename), source);
}

async function canonicalizeFixture(productDir: string, sourceFile: string): Promise<void> {
  await execFileAsync(DPRINT_COMMAND_NAME, [DPRINT_FORMAT_SUBCOMMAND, basename(sourceFile)], {
    cwd: productDir,
  });
}

async function initializeGitProductDir(productDir: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd: productDir });
}
