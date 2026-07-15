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
import { EventEmitter } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

import { parse as parseJsonc } from "jsonc-parser";
import { expect } from "vitest";
import { stringify } from "yaml";

import { allCommand } from "@/commands/validation/all";
import {
  FORMATTING_COMMAND_OUTPUT,
  formattingCommand,
  type FormattingCommandDependencies,
} from "@/commands/validation/formatting";
import type { ValidationCommandResult } from "@/commands/validation/types";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { formattingValidationLanguage } from "@/validation/languages/formatting";
import { markdownValidationLanguage } from "@/validation/languages/markdown";
import { VALIDATION_STAGE_PARTICIPATION } from "@/validation/languages/types";
import { typescriptValidationLanguage } from "@/validation/languages/typescript";
import { validationPipelineStages, validationRegistry } from "@/validation/registry";
import {
  buildDprintCheckArgs,
  DPRINT_CHECK_SUBCOMMAND,
  DPRINT_EXCLUDES_OPTION,
  DPRINT_EXECUTABLE_SPECIFIER,
  type FormattingValidationContext,
  validateFormatting,
} from "@/validation/steps/formatting";
import type { ValidationWritableStream } from "@/validation/steps/subprocess-output";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
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
import { collectHarnessTestCases, describe, it } from "@testing/harnesses/vitest-registration";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const execFileAsync = promisify(execFile);

const DPRINT_COMMAND_NAME = "dprint";
// Independent oracle for the spawned dprint path: resolved here from the
// source-owned specifier rather than via the production resolveDprintCommand(),
// so a defect in that resolver is caught instead of mirrored.
const EXPECTED_DPRINT_COMMAND = createRequire(import.meta.url).resolve(DPRINT_EXECUTABLE_SPECIFIER);
const DPRINT_FORMAT_SUBCOMMAND = "fmt";
const FORMATTING_TEMP_PREFIX = "dprint-validation-";
const FORMATTING_HARNESS_TIMEOUT = 30_000;

class RecordingFormattingWritable extends EventEmitter implements ValidationWritableStream {
  readonly chunks: string[] = [];

  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(Buffer.from(chunk).toString());
    return true;
  }
}

class OutputFormattingRunner extends RecordingSpawnOptionsRunner {
  constructor(
    private readonly stdoutChunk: string,
    private readonly stderrChunk: string,
  ) {
    super();
  }

  override spawn(command: string, args: readonly string[], options?: SpawnOptions): ChildProcess {
    this.commands.push(command);
    this.args.push([...args]);
    this.options.push(options ?? {});
    const child = new RecordingValidationChild();
    this.children.push(child);
    queueMicrotask(() => {
      child.stdout.write(this.stdoutChunk);
      child.stderr.write(this.stderrChunk);
      child.closeSuccessfully();
    });
    return child.asChildProcess();
  }
}

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
  describe("dprint maps declared extensions, excluded paths, and registry order", () => {
    for (const extension of FORMATTING_VALIDATION_DATA.formattedFileExtensions) {
      it(`reports an unformatted .${extension} file`, async () => {
        await withFormattingFixtureFiles(async (productDir) => {
          const fileName = `${FORMATTING_VALIDATION_DATA.typeScriptSourceFilename}.${extension}`;
          await writeFile(
            join(productDir, fileName),
            FORMATTING_VALIDATION_DATA.unformattedContentByExtension[extension],
          );
          const result = await formattingCommand({ cwd: productDir, files: [fileName] });

          expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.failureExitCode);
          expect(result.output).toContain(fileName);
        });
      });
    }
    for (const path of FORMATTING_VALIDATION_DATA.neverFormattedPaths) {
      it(`excludes ${path} from the formatting verdict`, async () => {
        await withFormattingFixtureFiles(async (productDir) => {
          const filePath = path.replace("**", FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
          await mkdir(dirname(join(productDir, filePath)), { recursive: true });
          await writeFile(
            join(productDir, filePath),
            FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent,
          );
          const result = await formattingCommand({ cwd: productDir });

          expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.passExitCode);
          expect(result.output).toBe(FORMATTING_COMMAND_OUTPUT.NO_ISSUES);
          expect(result.output).not.toContain(filePath);
        });
      });
    }
    it("maps language descriptors to contiguous registry stage segments", () => {
      const stageNames = validationPipelineStages.map((stage) => stage.name);
      const typescriptNames = typescriptValidationLanguage.stages.map((stage) => stage.name);
      const markdownNames = markdownValidationLanguage.stages.map((stage) => stage.name);
      const formattingNames = formattingValidationLanguage.stages.map((stage) => stage.name);

      expect(validationRegistry.languages).toEqual([
        typescriptValidationLanguage,
        markdownValidationLanguage,
        formattingValidationLanguage,
      ]);
      expect(stageNames).toEqual([...typescriptNames, ...markdownNames, ...formattingNames]);
    });
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
          const first = buildDprintCheckArgs({ excludes, files });
          const second = buildDprintCheckArgs({ excludes, files });
          expect(first).toEqual(second);
          expect(first[0]).toBe(FORMATTING_VALIDATION_DATA.expectedDprintCheckSubcommand);
          expect(first.slice(1, 1 + (excludes.length > 0 ? excludes.length + 1 : 0))).toEqual(
            excludes.length > 0
              ? [FORMATTING_VALIDATION_DATA.expectedDprintExcludesOption, ...excludes]
              : [],
          );
          const terminatorIndex = first.indexOf(FORMATTING_VALIDATION_DATA.expectedDprintOptionsTerminator);
          expect(files.length > 0 ? first.slice(terminatorIndex + 1) : []).toEqual(files);
          expect(first.includes(FORMATTING_VALIDATION_DATA.expectedDprintOptionsTerminator))
            .toBe(files.length > 0);
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });
}

export function registerFormattingComplianceEvidence(): void {
  describe("formatting subprocess and configuration compliance", () => {
    it("captures and forwards subprocess streams once from the supplied product directory", async () => {
      const stdoutChunk = sampleLiteralTestValue(arbitraryDomainLiteral());
      const stderrChunk = sampleLiteralTestValue(arbitraryDomainLiteral());
      const runner = new OutputFormattingRunner(stdoutChunk, stderrChunk);
      const stdout = new RecordingFormattingWritable();
      const stderr = new RecordingFormattingWritable();
      const productDir = process.cwd();
      const result = await validateFormatting({ productDir }, runner, { stdout, stderr });

      expect(result.output).toBe(`${stdoutChunk}${stderrChunk}`);
      expect(stdout.chunks).toEqual([stdoutChunk]);
      expect(stderr.chunks).toEqual([stderrChunk]);
      expect(runner.commands).toEqual([EXPECTED_DPRINT_COMMAND]);
      expect(runner.args).toEqual([[DPRINT_CHECK_SUBCOMMAND]]);
      expect(runner.spawnOptions?.cwd).toBe(productDir);
    });
    it("forwards configured validation excludes additively", async () => {
      await withFormattingFixtureFiles(async (productDir) => {
        await writeFile(
          join(productDir, FORMATTING_VALIDATION_DATA.validationConfigFilename),
          stringify({
            validation: {
              paths: { exclude: [FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName] },
            },
          }),
        );
        const contexts: FormattingValidationContext[] = [];
        const runner = new RecordingSpawnOptionsRunner();
        const result = await formattingCommand(
          { cwd: productDir },
          {
            validateFormatting: async (context) => {
              contexts.push(context);
              return validateFormatting(context, runner);
            },
          },
        );

        expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.passExitCode);
        expect(contexts).toEqual([
          expect.objectContaining({
            productDir,
            excludes: [FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName],
          }),
        ]);
        expect(runner.args).toEqual([
          [
            DPRINT_CHECK_SUBCOMMAND,
            DPRINT_EXCLUDES_OPTION,
            FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName,
          ],
        ]);
      });
    });
    it("skips when the product has no dprint config", async () => {
      const contexts: FormattingValidationContext[] = [];
      const result = await runFormattingWithoutConfig({
        validateFormatting: async (context) => {
          contexts.push(context);
          return { success: false, output: "" };
        },
      });
      expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.passExitCode);
      expect(result.output).toContain(FORMATTING_COMMAND_OUTPUT.NO_CONFIG_SKIP_REASON);
      expect(contexts).toHaveLength(0);
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
    case FORMATTING_SCENARIO_KIND.PARTICIPATION_OVERRIDE:
      return runParticipationOverrideScenario();
  }
}

async function runCleanProjectScenario(): Promise<void> {
  await withFormattingFixture(FORMATTING_VALIDATION_DATA.formattableTypeScriptContent, async (fixture) => {
    await canonicalizeFixture(fixture.productDir, fixture.sourceFile);

    const result = await formattingCommand({ cwd: fixture.productDir });

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.passExitCode);
    expect(result.output).toBe(FORMATTING_COMMAND_OUTPUT.NO_ISSUES);
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

    const contexts: FormattingValidationContext[] = [];
    await formattingCommand(
      { cwd: fixture.productDir, files: ["."] },
      {
        validateFormatting: async (context) => {
          contexts.push(context);
          return { success: true, output: "" };
        },
      },
    );
    expect(contexts).toEqual([
      expect.objectContaining({ files: [FORMATTING_VALIDATION_DATA.recursiveDirectoryGlob] }),
    ]);
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

    const contexts: FormattingValidationContext[] = [];
    await formattingCommand(
      { cwd: fixture.productDir, files: [FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName] },
      {
        validateFormatting: async (context) => {
          contexts.push(context);
          return { success: true, output: "" };
        },
      },
    );
    expect(contexts).toEqual([
      expect.objectContaining({
        files: [
          `${FORMATTING_VALIDATION_DATA.narrowedScopeDirectoryName}/${FORMATTING_VALIDATION_DATA.recursiveDirectoryGlob}`,
        ],
        excludes: [],
      }),
    ]);
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
    expect(result.output).toBe(FORMATTING_COMMAND_OUTPUT.NO_ISSUES);
    expect(result.output).not.toContain(FORMATTING_VALIDATION_DATA.typeScriptSourceFilename);
  });
}

async function runParticipationOverrideScenario(): Promise<void> {
  const formattingStage = formattingValidationLanguage.stages[0];
  const override = formattingStage.participation.override;
  let executionCount = 0;
  const observableStage = {
    ...formattingStage,
    run: async () => {
      executionCount += 1;
      return {
        exitCode: FORMATTING_VALIDATION_DATA.passExitCode,
        output: FORMATTING_COMMAND_OUTPUT.NO_ISSUES,
      };
    },
  };

  const defaultResult = await allCommand({
    cwd: process.cwd(),
    validationStages: [observableStage],
  });
  const skippedResult = await allCommand({
    cwd: process.cwd(),
    validationStages: [observableStage],
    participationOverrides: [override.flag],
  });

  expect(formattingStage.participation.default).toBe(VALIDATION_STAGE_PARTICIPATION.RUN);
  expect(defaultResult.exitCode).toBe(FORMATTING_VALIDATION_DATA.passExitCode);
  expect(skippedResult.exitCode).toBe(FORMATTING_VALIDATION_DATA.passExitCode);
  expect(skippedResult.output).toContain(override.flag);
  expect(executionCount).toBe(FORMATTING_VALIDATION_DATA.failureExitCode);
}

/**
 * Run the formatting command against a temp product that has no `dprint.jsonc`.
 *
 * The product carries an unformatted file but no config, so the stage must skip
 * rather than let a personal global dprint config decide the verdict.
 */
export function runFormattingWithoutConfig(
  dependencies?: FormattingCommandDependencies,
): Promise<ValidationCommandResult> {
  return withTempDir(FORMATTING_TEMP_PREFIX, async (productDir) => {
    await writeFile(
      join(productDir, FORMATTING_VALIDATION_DATA.typeScriptSourceFilename),
      FORMATTING_VALIDATION_DATA.unformattedTypeScriptContent,
    );
    return formattingCommand({ cwd: productDir }, dependencies);
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

async function withFormattingFixtureFiles(
  callback: (productDir: string) => Promise<void>,
): Promise<void> {
  await withTempDir(FORMATTING_TEMP_PREFIX, async (productDir) => {
    copyProductDprintConfig(productDir);
    await callback(productDir);
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
