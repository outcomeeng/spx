import "@testing/harnesses/validation/scope-resolution-compliance";

import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import { TEMP_DIRECTORY_PATH } from "@/lib/temp-directory";
import { TSCONFIG_FILES, TYPESCRIPT_FALLBACK_INCLUDE_PATTERNS } from "@/validation/config/scope";
import { KNIP_COMMAND_TOKENS } from "@/validation/steps/knip";
import { VALIDATION_SCOPES } from "@/validation/types";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  arbitraryForeignScratchNames,
  arbitraryLeftoverScratchNames,
} from "@testing/generators/temp-directory/temp-directory";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import {
  ErrorThenCloseRunner,
  runKnipValidationWithRecordedConfig,
  runTypeScriptValidationWithRecordedConfig,
  VALIDATION_SCRATCH_STAGE,
  withValidationScratchRun,
} from "@testing/harnesses/validation/scratch-directories";

describe("ALWAYS: the temporary tsconfig of scope-filtered or file-specific validation is written inside the product's node_modules scratch parent", () => {
  it("writes the scope-filtered TypeScript config there and fabricates no compiler options", async () => {
    const { productDir, result, writtenConfigs, writtenConfigPaths } = await runTypeScriptValidationWithRecordedConfig({
      scope: VALIDATION_SCOPES.FULL,
      scopeConfig: {
        directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
        filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
        excludePatterns: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
        filteredByValidationPaths: true,
      },
    });

    expect(result.success).toBe(true);
    expect(writtenConfigPaths).toHaveLength(1);
    expect(writtenConfigPaths[0]?.startsWith(join(productDir, "node_modules"))).toBe(true);
    expect(
      writtenConfigPaths[0]?.startsWith(join(productDir, ...TEMP_DIRECTORY_PATH.SCRATCH_PARENT_SEGMENTS)),
    ).toBe(true);
    const writtenConfig = JSON.parse(writtenConfigs[0] ?? "{}");
    expect(writtenConfig.extends).toBe(join(productDir, TSCONFIG_FILES.full));
    expect(writtenConfig.compilerOptions).toEqual({ noEmit: true });
    expect(writtenConfig).not.toHaveProperty("typeRoots");
    expect(writtenConfig).not.toHaveProperty("types");
    expect(writtenConfig.compilerOptions).not.toHaveProperty("typeRoots");
    expect(writtenConfig.compilerOptions).not.toHaveProperty("types");
  });

  it("writes the file-specific TypeScript config there and fabricates no compiler options", async () => {
    const { productDir, result, writtenConfigs, writtenConfigPaths } = await runTypeScriptValidationWithRecordedConfig({
      scope: VALIDATION_SCOPES.FULL,
      files: [VALIDATION_PIPELINE_DATA.scopeResolutionSourceFile],
    });

    expect(result.success).toBe(true);
    expect(writtenConfigPaths).toHaveLength(1);
    expect(writtenConfigPaths[0]?.startsWith(join(productDir, "node_modules"))).toBe(true);
    expect(
      writtenConfigPaths[0]?.startsWith(join(productDir, ...TEMP_DIRECTORY_PATH.SCRATCH_PARENT_SEGMENTS)),
    ).toBe(true);
    const writtenConfig = JSON.parse(writtenConfigs[0] ?? "{}");
    expect(writtenConfig.extends).toBe(join(productDir, TSCONFIG_FILES.full));
    expect(writtenConfig.compilerOptions).toEqual({ noEmit: true });
    expect(writtenConfig).not.toHaveProperty("typeRoots");
    expect(writtenConfig).not.toHaveProperty("types");
    expect(writtenConfig.compilerOptions).not.toHaveProperty("typeRoots");
    expect(writtenConfig.compilerOptions).not.toHaveProperty("types");
  });

  it("writes the config-filtered Knip config there with the directory fallback patterns and the scoped file pattern", async () => {
    const { productDir, result, runner, writtenConfigs, writtenConfigPaths } =
      await runKnipValidationWithRecordedConfig({
        typescriptScope: {
          directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
          filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
          excludePatterns: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
          filteredByValidationPaths: true,
        },
      });

    expect(result.success).toBe(true);
    expect(runner.options.every((options) => options.cwd === productDir)).toBe(true);
    expect(runner.args[0]?.slice(0, 3)).toEqual([
      KNIP_COMMAND_TOKENS.COMMAND,
      KNIP_COMMAND_TOKENS.USE_TSCONFIG_FILES_FLAG,
      KNIP_COMMAND_TOKENS.TSCONFIG_FLAG,
    ]);
    expect(writtenConfigPaths[0]?.startsWith(join(productDir, "node_modules"))).toBe(true);
    expect(
      writtenConfigPaths[0]?.startsWith(join(productDir, ...TEMP_DIRECTORY_PATH.SCRATCH_PARENT_SEGMENTS)),
    ).toBe(true);
    expect(writtenConfigs).toHaveLength(1);
    expect(JSON.parse(writtenConfigs[0] ?? "{}")).toEqual({
      extends: join(productDir, TSCONFIG_FILES.full),
      include: [
        ...TYPESCRIPT_FALLBACK_INCLUDE_PATTERNS.map((pattern) =>
          join(productDir, VALIDATION_PIPELINE_DATA.sourceDirectoryName, pattern)
        ),
        join(productDir, VALIDATION_PIPELINE_DATA.productionScopeFilePattern),
      ],
      exclude: [join(productDir, VALIDATION_PIPELINE_DATA.productionScopeExcludePattern)],
    });
  });

  it("writes the directory-scoped Knip config there with the directory fallback patterns and the retained literal file pattern", async () => {
    const retainedFilePattern = join(
      VALIDATION_PIPELINE_DATA.sourceDirectoryName,
      VALIDATION_PIPELINE_DATA.narrowSourceDirectoryName,
      VALIDATION_PIPELINE_DATA.cleanSourceFileName,
    );
    const { productDir, result, writtenConfigs, writtenConfigPaths } = await runKnipValidationWithRecordedConfig({
      typescriptScope: {
        directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
        filePatterns: [retainedFilePattern],
        excludePatterns: [],
        filteredByValidationPaths: true,
      },
    });

    expect(result).toEqual({ success: true, output: "" });
    expect(writtenConfigPaths[0]?.startsWith(join(productDir, "node_modules"))).toBe(true);
    expect(
      writtenConfigPaths[0]?.startsWith(join(productDir, ...TEMP_DIRECTORY_PATH.SCRATCH_PARENT_SEGMENTS)),
    ).toBe(true);
    expect(JSON.parse(writtenConfigs[0] ?? "{}")).toEqual({
      extends: join(productDir, TSCONFIG_FILES.full),
      include: [
        ...TYPESCRIPT_FALLBACK_INCLUDE_PATTERNS.map((pattern) =>
          join(productDir, VALIDATION_PIPELINE_DATA.sourceDirectoryName, pattern)
        ),
        join(productDir, retainedFilePattern),
      ],
      exclude: [],
    });
  });

  it("removes the config-filtered Knip scratch directory once when the tool process emits error and close", async () => {
    const errorMessage = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    await withValidationScratchRun(async (scratch) => {
      const runner = new ErrorThenCloseRunner(errorMessage);

      const result = await scratch.runKnip(runner);

      expect(result).toEqual({ success: false, error: errorMessage });
      expect(scratch.removed).toHaveLength(1);
      expect(scratch.scratchEntries()).toEqual([]);
      expect(runner.options.every((options) => options.cwd === scratch.productDirectory)).toBe(true);
    });
  });
});

describe.each(Object.values(VALIDATION_SCRATCH_STAGE))(
  "ALWAYS: the temporary tsconfig directory of %s validation is a product-local scratch directory of the temp-directory substrate",
  (stage) => {
    it.each([VALIDATION_EXIT_CODES.SUCCESS, VALIDATION_EXIT_CODES.FAILURE])(
      "creates it under the scratch parent with the scratch prefix and removes it when the tool exits with code %s",
      async (exitCode) => {
        await withValidationScratchRun(async (scratch) => {
          const observed = await scratch.runStage(stage, exitCode);

          expect(observed.entriesDuringStage).toHaveLength(1);
          const [entryName] = observed.entriesDuringStage;
          expect(entryName?.startsWith(TEMP_DIRECTORY_PATH.SCRATCH_PREFIX)).toBe(true);
          expect(observed.configDirectories).toEqual([join(scratch.scratchParent, entryName ?? "")]);
          expect(observed.entriesAfterStage).toEqual([]);
          expect(scratch.removed).toContain(join(scratch.scratchParent, entryName ?? ""));
        });
      },
    );

    it("removes every leftover scratch entry a killed run left at its first scratch request and keeps entries of other tools", async () => {
      await withValidationScratchRun(async (scratch) => {
        const leftoverNames = sampleGeneratedValue(arbitraryLeftoverScratchNames());
        const foreignNames = sampleGeneratedValue(arbitraryForeignScratchNames());
        for (const name of [...leftoverNames, ...foreignNames]) {
          scratch.seedEntry(name);
        }

        const observed = await scratch.runStage(stage, VALIDATION_EXIT_CODES.SUCCESS);

        for (const name of leftoverNames) {
          expect(observed.entriesDuringStage).not.toContain(name);
          expect(observed.entriesAfterStage).not.toContain(name);
        }
        expect(observed.entriesDuringStage).toEqual(expect.arrayContaining(foreignNames));
        expect(observed.entriesAfterStage).toHaveLength(foreignNames.length);
        expect(observed.entriesAfterStage).toEqual(expect.arrayContaining(foreignNames));
      });
    });
  },
);
