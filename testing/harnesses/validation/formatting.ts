/**
 * Formatting validation driver harness.
 *
 * Runs the dprint formatting stage's scenarios against hermetic temp fixtures
 * that carry a copy of the product's `dprint.jsonc` (so the pinned, cached
 * plugins resolve) and invoke the real `dprint` binary from `PATH`. The clean
 * fixture is canonicalized with `dprint fmt` so the pass case never depends on
 * the surrounding repository's formatting state.
 */

import { type ChildProcess, execFile, type SpawnOptions } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { allCommand } from "@/commands/validation/all";
import { FORMATTING_COMMAND_OUTPUT, formattingCommand } from "@/commands/validation/formatting";
import type { ValidationCommandResult } from "@/commands/validation/types";
import { validationCliDefinition } from "@/interfaces/cli/validation";
import type { ProcessRunner } from "@/lib/process-lifecycle";
import { formattingValidationLanguage } from "@/validation/languages/formatting";
import { markdownValidationLanguage } from "@/validation/languages/markdown";
import { typescriptValidationLanguage } from "@/validation/languages/typescript";
import { composeValidationPipelineStages, validationPipelineStages, validationRegistry } from "@/validation/registry";
import {
  buildDprintCheckArgs,
  type FormattingValidationContext,
  type FormattingValidationResult,
  validateFormatting,
} from "@/validation/steps/formatting";
import {
  arbitraryDprintFileArguments,
  FORMATTING_SCENARIO_KIND,
  FORMATTING_VALIDATION_DATA,
  formattingScenarios,
  type FormattingValidationScenario,
} from "@testing/generators/validation/formatting";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { runValidationSubprocess } from "@testing/harnesses/validation/cli";
import { RecordingSpawnOptionsRunner, RecordingValidationChild } from "@testing/harnesses/validation/subprocess";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const execFileAsync = promisify(execFile);

const DPRINT_COMMAND_NAME = "dprint";
const DPRINT_FORMAT_SUBCOMMAND = "fmt";

interface FormattingFixture {
  readonly productDir: string;
  readonly sourceFile: string;
}

export function registerFormattingScenarioEvidence(): void {
  describe("dprint formatting validation scenarios", () => {
    for (const scenario of formattingScenarios()) {
      it(scenario.title, () => runFormattingScenario(scenario), scenario.timeout);
    }
    it("keeps directory excludes when an explicit file is also in scope", () =>
      runMixedFileAndDirectoryScopeScenario());
    it("runs by descriptor default and skips through its invocation-local override", () =>
      runFormattingParticipationScenario());
  });
}

async function runMixedFileAndDirectoryScopeScenario(): Promise<void> {
  await withTempDir(FORMATTING_VALIDATION_DATA.tempPrefix, async (productDir) => {
    copyProductDprintConfig(productDir);
    await mkdir(join(productDir, FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName));
    await writeFile(
      join(productDir, FORMATTING_VALIDATION_DATA.typeScriptSourceFilename),
      "export const value = 1;\n",
    );
    await writeFile(
      join(productDir, FORMATTING_VALIDATION_DATA.validationConfigFilename),
      stringify({
        validation: {
          paths: { exclude: [FORMATTING_VALIDATION_DATA.excludedScopeDirectoryName] },
        },
      }),
    );
    const contexts: FormattingValidationContext[] = [];
    await formattingCommand(
      {
        cwd: productDir,
        files: [
          FORMATTING_VALIDATION_DATA.typeScriptSourceFilename,
          FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName,
        ],
      },
      {
        validateFormatting: async (context): Promise<FormattingValidationResult> => {
          contexts.push(context);
          return { success: true, output: "" };
        },
      },
    );
    expect(contexts).toEqual([
      {
        productDir: productDir,
        files: [FORMATTING_VALIDATION_DATA.typeScriptSourceFilename],
        excludes: [],
      },
      {
        productDir: productDir,
        files: [`${FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName}/**/*`],
        excludes: [FORMATTING_VALIDATION_DATA.excludedScopeDirectoryName],
      },
    ]);
  });
}

export function registerFormattingMappingEvidence(): void {
  describe("dprint formats the spec-declared extensions and skips the excluded paths", () => {
    it.each(FORMATTING_VALIDATION_DATA.formattedFileExtensions)(
      "reports an unformatted .%s file",
      (extension) => runConfiguredExtensionBehavior(extension),
    );
    it.each(FORMATTING_VALIDATION_DATA.excludedFormattingCases)(
      "excludes $path",
      (excludedCase) => runTrackedExcludeBehavior(excludedCase),
    );
  });
  describe("the formatting stage composes additively into the validation pipeline", () => {
    const baseLanguages = [typescriptValidationLanguage, markdownValidationLanguage];
    const baseStages = baseLanguages.flatMap((language) => language.stages);
    it.each(baseStages.map((stage, index) => ({ index, stage })))(
      "preserves stage $stage.name at index $index",
      ({ index, stage }) => expect(validationPipelineStages.at(index)).toBe(stage),
    );
    it.each(formattingValidationLanguage.stages.map((stage, offset) => ({ offset, stage })))(
      "appends stage $stage.name at offset $offset",
      ({ offset, stage }) => expect(validationPipelineStages.at(baseStages.length + offset)).toBe(stage),
    );
    it("derives ordering from the descriptor order supplied to the registry composition", () => {
      const reorderedLanguages = [
        formattingValidationLanguage,
        ...baseLanguages,
      ];
      expect(composeValidationPipelineStages(reorderedLanguages)).toEqual([
        ...formattingValidationLanguage.stages,
        ...baseStages,
      ]);
    });
  });
}

export function registerFormattingPropertyEvidence(): void {
  describe("dprint check argument construction is deterministic and scope-preserving", () => {
    it("emits the check subcommand and terminator before preserving every file argument in order", () => {
      assertProperty(arbitraryDprintFileArguments(), (files) => {
        expect(buildDprintCheckArgs({ files })).toEqual(
          files.length > 0
            ? [
              FORMATTING_VALIDATION_DATA.expectedDprintCheckSubcommand,
              FORMATTING_VALIDATION_DATA.expectedDprintOptionsTerminator,
              ...files,
            ]
            : [FORMATTING_VALIDATION_DATA.expectedDprintCheckSubcommand],
        );
      }, { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL });
    });
    it("emits only the check subcommand when no file scope is supplied", () => {
      expect(buildDprintCheckArgs({})).toEqual([FORMATTING_VALIDATION_DATA.expectedDprintCheckSubcommand]);
    });
    it("emits additive excludes before preserving every file argument in order", () => {
      assertProperty(
        arbitraryDprintFileArguments().chain((excludes) =>
          arbitraryDprintFileArguments().map((files) => ({ excludes, files }))
        ),
        ({ excludes, files }) => {
          expect(buildDprintCheckArgs({ excludes, files })).toEqual([
            FORMATTING_VALIDATION_DATA.expectedDprintCheckSubcommand,
            ...(excludes.length > 0 ? [FORMATTING_VALIDATION_DATA.expectedDprintExcludesOption, ...excludes] : []),
            ...(files.length > 0 ? [FORMATTING_VALIDATION_DATA.expectedDprintOptionsTerminator] : []),
            ...files,
          ]);
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });
}

export function registerFormattingComplianceEvidence(): void {
  describe("formatting configuration is reproducible", () => {
    it("runs dprint from the supplied product directory", () => runFormattingProductDirCompliance());
    it("derives include and exclude scope from resolved validation configuration", async () => {
      await runFormattingDispatchContractCompliance();
    });
    it("passes resolved excludes into the dprint subprocess invocation", () =>
      runFormattingExcludeArgumentCompliance());
  });
  describe("formatting skips without a product dprint config", () => {
    it("exits zero without letting a global config decide", async () => {
      const result = await runFormattingWithoutConfig();
      expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.passExitCode);
      expect(result.output).toContain(FORMATTING_COMMAND_OUTPUT.NO_CONFIG_SKIP_REASON);
    });
  });
  describe("formatting subprocess output ownership", () => {
    it("forwards output through parent streams while retaining captured output", () =>
      runFormattingOutputStreamingCompliance());
  });
}

async function runFormattingDispatchContractCompliance(): Promise<void> {
  await withTempDir(FORMATTING_VALIDATION_DATA.tempPrefix, async (productDir) => {
    copyProductDprintConfig(productDir);
    await mkdir(join(productDir, FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName));
    await writeFile(
      join(productDir, FORMATTING_VALIDATION_DATA.validationConfigFilename),
      stringify({
        validation: {
          paths: {
            include: [FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName],
            exclude: [FORMATTING_VALIDATION_DATA.excludedScopeDirectoryName],
          },
        },
      }),
    );
    const contexts: FormattingValidationContext[] = [];
    await formattingCommand(
      { cwd: productDir, files: ["."] },
      {
        validateFormatting: async (context): Promise<FormattingValidationResult> => {
          contexts.push(context);
          return { success: true, output: "" };
        },
      },
    );
    expect(contexts).toEqual([
      {
        productDir: productDir,
        files: [`${FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName}/**/*`],
        excludes: [FORMATTING_VALIDATION_DATA.excludedScopeDirectoryName],
      },
    ]);
  });
}

async function runFormattingDirectoryDispatchScenario(): Promise<void> {
  await withTempDir(FORMATTING_VALIDATION_DATA.tempPrefix, async (productDir) => {
    copyProductDprintConfig(productDir);
    await mkdir(join(productDir, FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName));
    const runner = new RecordingSpawnOptionsRunner();
    await formattingCommand(
      { cwd: productDir, files: [FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName] },
      { validateFormatting: (context) => validateFormatting(context, runner) },
    );
    expect(runner.args).toEqual([[
      FORMATTING_VALIDATION_DATA.expectedDprintCheckSubcommand,
      FORMATTING_VALIDATION_DATA.expectedDprintOptionsTerminator,
      `${FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName}/**/*`,
    ]]);
  });
}

async function runFormattingExcludedDirectoryDispatchScenario(): Promise<void> {
  await withTempDir(FORMATTING_VALIDATION_DATA.tempPrefix, async (productDir) => {
    copyProductDprintConfig(productDir);
    await mkdir(join(productDir, FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName));
    await writeFile(
      join(productDir, FORMATTING_VALIDATION_DATA.validationConfigFilename),
      stringify({
        validation: {
          paths: {
            exclude: [
              `${FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName}/${FORMATTING_VALIDATION_DATA.excludedScopeDirectoryName}`,
            ],
          },
        },
      }),
    );
    const runner = new RecordingSpawnOptionsRunner();
    await formattingCommand(
      { cwd: productDir, files: [FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName] },
      { validateFormatting: (context) => validateFormatting(context, runner) },
    );
    expect(runner.args).toEqual([[
      FORMATTING_VALIDATION_DATA.expectedDprintCheckSubcommand,
      FORMATTING_VALIDATION_DATA.expectedDprintExcludesOption,
      `${FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName}/${FORMATTING_VALIDATION_DATA.excludedScopeDirectoryName}`,
      FORMATTING_VALIDATION_DATA.expectedDprintOptionsTerminator,
      `${FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName}/**/*`,
    ]]);
  });
}

async function runFormattingExcludeArgumentCompliance(): Promise<void> {
  await withTempDir(FORMATTING_VALIDATION_DATA.tempPrefix, async (productDir) => {
    const runner = new RecordingSpawnOptionsRunner();
    await validateFormatting(
      {
        productDir,
        files: [`${FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName}/**/*`],
        excludes: [FORMATTING_VALIDATION_DATA.excludedScopeDirectoryName],
      },
      runner,
    );
    expect(runner.args).toEqual([[
      FORMATTING_VALIDATION_DATA.expectedDprintCheckSubcommand,
      FORMATTING_VALIDATION_DATA.expectedDprintExcludesOption,
      FORMATTING_VALIDATION_DATA.excludedScopeDirectoryName,
      FORMATTING_VALIDATION_DATA.expectedDprintOptionsTerminator,
      `${FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName}/**/*`,
    ]]);
  });
}

async function runFormattingParticipationScenario(): Promise<void> {
  await withTempDir(FORMATTING_VALIDATION_DATA.tempPrefix, async (productDir) => {
    const defaultResult = await allCommand({
      cwd: productDir,
      validationStages: formattingValidationLanguage.stages,
    });
    const overrideResult = await allCommand({
      cwd: productDir,
      validationStages: formattingValidationLanguage.stages,
      participationOverrides: [formattingParticipationOverrideFlag()],
    });
    expect(defaultResult.output).toContain(FORMATTING_COMMAND_OUTPUT.NO_CONFIG_SKIP_REASON);
    expect(overrideResult.output).toContain("skip-formatting");
  });
}

function formattingParticipationOverrideFlag(): `--${string}` {
  const flag = formattingValidationLanguage.stages[0]?.participation.override?.flag;
  if (flag === undefined) throw new Error("formatting stage must declare an invocation-local override");
  return flag;
}

async function runConfiguredExtensionBehavior(
  extension: (typeof FORMATTING_VALIDATION_DATA.formattedFileExtensions)[number],
): Promise<void> {
  await withTempDir(FORMATTING_VALIDATION_DATA.tempPrefix, async (productDir) => {
    copyProductDprintConfig(productDir);
    const filename = `sample.${extension}`;
    await writeFile(
      join(productDir, filename),
      FORMATTING_VALIDATION_DATA.unformattedContentByExtension[extension],
    );
    const result = await formattingCommand({ cwd: productDir });
    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.failureExitCode);
    expect(result.output).toContain(filename);
  });
}

async function runTrackedExcludeBehavior(
  excludedCase: (typeof FORMATTING_VALIDATION_DATA.excludedFormattingCases)[number],
): Promise<void> {
  await withTempDir(FORMATTING_VALIDATION_DATA.tempPrefix, async (productDir) => {
    copyProductDprintConfig(productDir);
    const excludedPath = join(productDir, excludedCase.path);
    await mkdir(dirname(excludedPath), { recursive: true });
    await writeFile(excludedPath, excludedCase.content);
    const result = await formattingCommand({ cwd: productDir });
    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.passExitCode);
    expect(result.output).toContain(FORMATTING_COMMAND_OUTPUT.NO_ISSUES);
    expect(result.output).not.toContain(excludedCase.path);
  });
}

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
    expect(result.output).toContain(FORMATTING_COMMAND_OUTPUT.NO_ISSUES);
    expect(result.output).not.toContain(FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
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
    const result = await allCommand({ cwd: fixture.productDir });

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.failureExitCode);
    expect(result.output).toContain(FORMATTING_COMMAND_OUTPUT.FAILURE_SUMMARY);
    expect(result.output).toContain(FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
    expect(validationRegistry.languages).toContain(formattingValidationLanguage);
    expect(validationPipelineStages).toEqual(expect.arrayContaining([...formattingValidationLanguage.stages]));
  });
}

async function runFormattingProductDirCompliance(): Promise<void> {
  await withTempDir(FORMATTING_VALIDATION_DATA.tempPrefix, async (productDir) => {
    const runner = new RecordingSpawnOptionsRunner();
    const result = await validateFormatting({ productDir: productDir }, runner);
    expect(result.success).toBe(true);
    expect(runner.spawnOptions).toEqual(expect.objectContaining({ cwd: productDir }));
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
    expect(result.stdout).toContain(FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
    expect(`${result.stdout}${result.stderr}`.split(FORMATTING_VALIDATION_DATA.typeScriptSourceFilename)).toHaveLength(
      2,
    );
  });
}

async function runCliProcessDirectoryScopeScenario(): Promise<void> {
  await runFormattingDirectoryDispatchScenario();
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent, async (fixture) => {
    const result = await runValidationSubprocess(
      [
        validationCliDefinition.subcommands.format.commandName,
        ".",
      ],
      { cwd: fixture.productDir },
    );

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.failureExitCode);
    expect(result.stdout).toContain(FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
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
    expect(result.stdout).toContain(FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath);
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

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.passExitCode);
    expect(result.stdout).toContain(FORMATTING_COMMAND_OUTPUT.NO_ISSUES);
    expect(result.stdout).not.toContain(FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
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
    expect(result.stdout).toContain(FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath);
  });
}

async function runCliProcessFilteredDirectoryScopeScenario(): Promise<void> {
  await runFormattingDispatchContractCompliance();
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.formattableTypeScriptContent, async (fixture) => {
    const sourceDirectory = join(fixture.productDir, FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName);
    await mkdir(sourceDirectory);
    await writeFile(
      join(fixture.productDir, FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath),
      FORMATTING_VALIDATION_DATA.formattableTypeScriptContent,
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

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.passExitCode);
    expect(result.stdout).toContain(FORMATTING_COMMAND_OUTPUT.NO_ISSUES);
    expect(result.stdout).not.toContain(FORMATTING_VALIDATION_DATA.secondaryScopeTypeScriptSourcePath);
  });
}

async function runCliProcessExcludedDirectoryScopeScenario(): Promise<void> {
  await runFormattingExcludedDirectoryDispatchScenario();
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
    expect(result.stdout).toContain(FORMATTING_VALIDATION_DATA.narrowedScopeTypeScriptSourcePath);
    expect(result.stdout).not.toContain(FORMATTING_VALIDATION_DATA.excludedScopeTypeScriptSourcePath);
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
    expect(result.output).toContain(FORMATTING_COMMAND_OUTPUT.NO_ISSUES);
    expect(result.output).not.toContain(FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
  });
}

/**
 * Run the formatting command against a temp project that has no `dprint.jsonc`.
 *
 * The project carries an unformatted file but no config, so the stage must skip
 * rather than let a personal global dprint config decide the verdict.
 */
export function runFormattingWithoutConfig(): Promise<ValidationCommandResult> {
  return withTempDir(FORMATTING_VALIDATION_DATA.tempPrefix, async (productDir) => {
    await writeFile(
      join(productDir, FORMATTING_VALIDATION_DATA.typeScriptSourceFilename),
      FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent,
    );
    return formattingCommand({ cwd: productDir });
  });
}

export async function runFormattingOutputStreamingCompliance(): Promise<void> {
  const runner = new FormattingOutputRunner();
  const stdout: string[] = [];
  const stderr: string[] = [];
  const result = await validateFormatting(
    { productDir: process.cwd() },
    runner,
    {
      stdout: { write: (chunk) => stdout.push(Buffer.from(chunk).toString()) > 0 },
      stderr: { write: (chunk) => stderr.push(Buffer.from(chunk).toString()) > 0 },
    },
  );

  expect(result.success).toBe(false);
  expect(result.output).toBe(
    `${FORMATTING_VALIDATION_DATA.typeScriptSourceFilename.repeat(2)}${FORMATTING_COMMAND_OUTPUT.FAILURE_SUMMARY}`,
  );
  expect(stdout).toEqual([
    FORMATTING_VALIDATION_DATA.typeScriptSourceFilename,
    FORMATTING_VALIDATION_DATA.typeScriptSourceFilename,
  ]);
  expect(stderr).toEqual([FORMATTING_COMMAND_OUTPUT.FAILURE_SUMMARY]);
}

class FormattingOutputRunner implements ProcessRunner {
  spawn(_command: string, _args: readonly string[], _options?: SpawnOptions): ChildProcess {
    const child = new RecordingValidationChild();
    queueMicrotask(() => {
      child.stdout.write(FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
      child.stdout.write(FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
      child.stderr.write(FORMATTING_COMMAND_OUTPUT.FAILURE_SUMMARY);
      child.emit("close", FORMATTING_VALIDATION_DATA.failureExitCode);
    });
    return child.asChildProcess();
  }
}

async function withFormattingFixture(
  sourceContent: string,
  callback: (fixture: FormattingFixture) => Promise<void>,
): Promise<void> {
  await withTempDir(FORMATTING_VALIDATION_DATA.tempPrefix, async (productDir) => {
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
