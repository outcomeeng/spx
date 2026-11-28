import { describe, expect, it } from "vitest";

import { allCommand } from "@/commands/validation/all";
import { FORMATTING_COMMAND_OUTPUT, formattingCommand } from "@/commands/validation/formatting";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { VALIDATION_STAGE_PARTICIPATION } from "@/validation/languages/types";
import { FORMATTING_VALIDATION_DATA as DATA } from "@testing/generators/validation/formatting";
import { runValidationSubprocess } from "@testing/harnesses/validation/cli";
import {
  canonicalizeFixture,
  FORMATTING_HARNESS_TIMEOUT,
  initializeGitProductDir,
  observeFormattingParticipation,
  recordFormattingContexts,
  withFormattingFixture,
  writeFixtureFile,
  writeGitignore,
  writeValidationPathFilters,
} from "@testing/harnesses/validation/formatting";

describe("spx validation format", () => {
  it(
    "reports no problems and exits 0 for a product whose files are all formatted",
    async () => {
      await withFormattingFixture(DATA.formattableTypeScriptContent, async (fixture) => {
        await canonicalizeFixture(fixture);

        const result = await formattingCommand({ cwd: fixture.productDir });

        expect(result.exitCode).toBe(DATA.passExitCode);
        expect(result.output).toBe(FORMATTING_COMMAND_OUTPUT.NO_ISSUES);
      });
    },
    FORMATTING_HARNESS_TIMEOUT,
  );

  it(
    "reports a problem naming the unformatted file and exits non-zero",
    async () => {
      await withFormattingFixture(DATA.unformattedTypeScriptContent, async (fixture) => {
        const result = await formattingCommand({ cwd: fixture.productDir });

        expect(result.exitCode).toBe(DATA.failureExitCode);
        expect(result.output).toContain(DATA.typeScriptSourceFilename);
      });
    },
    FORMATTING_HARNESS_TIMEOUT,
  );

  it(
    "skips a gitignored unformatted file and exits 0",
    async () => {
      await withFormattingFixture(DATA.unformattedTypeScriptContent, async (fixture) => {
        await writeGitignore(fixture.productDir, [DATA.typeScriptSourceFilename]);

        const result = await formattingCommand({ cwd: fixture.productDir });

        expect(result.exitCode).toBe(DATA.passExitCode);
        expect(result.output).toBe(FORMATTING_COMMAND_OUTPUT.NO_ISSUES);
      });
    },
    FORMATTING_HARNESS_TIMEOUT,
  );
});

describe("spx validation all with formatting", () => {
  it(
    "reports the formatting failure and exits non-zero",
    async () => {
      await withFormattingFixture(DATA.unformattedTypeScriptContent, async (fixture) => {
        const result = await allCommand({ cwd: fixture.productDir });

        expect(result.exitCode).toBe(DATA.failureExitCode);
        expect(result.output).toContain(FORMATTING_COMMAND_OUTPUT.FAILURE_SUMMARY);
      });
    },
    FORMATTING_HARNESS_TIMEOUT,
  );

  it("runs formatting by default and skips it under the descriptor's invocation-local override", async () => {
    const observation = await observeFormattingParticipation();

    expect(observation.defaultParticipation).toBe(VALIDATION_STAGE_PARTICIPATION.RUN);
    expect(observation.defaultResult.exitCode).toBe(DATA.passExitCode);
    expect(observation.overriddenResult.exitCode).toBe(DATA.passExitCode);
    expect(observation.overriddenResult.output).toContain(observation.overrideFlag);
    expect(observation.executionCount).toBe(DATA.singleStageExecutionCount);
  });
});

describe("the spx validation format process", () => {
  it(
    "exits non-zero and names the unformatted file",
    async () => {
      await withFormattingFixture(DATA.unformattedTypeScriptContent, async (fixture) => {
        const result = await runValidationSubprocess([
          validationCliDefinition.subcommands.format.commandName,
          DATA.typeScriptSourceFilename,
        ], {
          cwd: fixture.productDir,
        });

        expect(result.exitCode).toBe(DATA.failureExitCode);
        expect(result.stderr).toContain(DATA.typeScriptSourceFilename);
      });
    },
    FORMATTING_HARNESS_TIMEOUT,
  );

  it(
    "expands a directory operand to a recursive glob before dprint dispatch",
    async () => {
      await withFormattingFixture(DATA.unformattedTypeScriptContent, async (fixture) => {
        const result = await runValidationSubprocess([
          validationCliDefinition.subcommands.format.commandName,
          DATA.productRootOperand,
        ], {
          cwd: fixture.productDir,
        });
        const contexts = await recordFormattingContexts({
          cwd: fixture.productDir,
          files: [DATA.productRootOperand],
        });

        expect(result.exitCode).toBe(DATA.failureExitCode);
        expect(result.stderr).toContain(DATA.typeScriptSourceFilename);
        expect(contexts.map((context) => context.files)).toEqual([[DATA.recursiveDirectoryGlob]]);
      });
    },
    FORMATTING_HARNESS_TIMEOUT,
  );

  it(
    "resolves a relative operand from the effective invocation directory",
    async () => {
      await withFormattingFixture(DATA.formattableTypeScriptContent, async (fixture) => {
        await initializeGitProductDir(fixture.productDir);
        await writeFixtureFile(
          fixture.productDir,
          DATA.narrowedScopeTypeScriptSourcePath,
          DATA.unformattedTypeScriptContent,
        );

        const result = await runValidationSubprocess([
          validationCliDefinition.subcommands.format.commandName,
          DATA.typeScriptSourceFilename,
        ], {
          cwd: `${fixture.productDir}/${DATA.narrowedScopeDirectoryName}`,
        });

        expect(result.exitCode).toBe(DATA.failureExitCode);
        expect(result.stderr).toContain(DATA.narrowedScopeTypeScriptSourcePath);
      });
    },
    FORMATTING_HARNESS_TIMEOUT,
  );

  it(
    "checks a root directory operand outside the validation includes",
    async () => {
      await withFormattingFixture(DATA.unformattedTypeScriptContent, async (fixture) => {
        await writeFixtureFile(
          fixture.productDir,
          DATA.narrowedScopeTypeScriptSourcePath,
          DATA.formattableTypeScriptContent,
        );
        await writeValidationPathFilters(fixture.productDir, { include: [DATA.narrowedScopeDirectoryName] });

        const result = await runValidationSubprocess([
          validationCliDefinition.subcommands.format.commandName,
          DATA.productRootOperand,
        ], {
          cwd: fixture.productDir,
        });

        expect(result.exitCode).toBe(DATA.failureExitCode);
        expect(result.stderr).toContain(DATA.typeScriptSourceFilename);
      });
    },
    FORMATTING_HARNESS_TIMEOUT,
  );

  it(
    "checks an explicit file operand the validation excludes would remove",
    async () => {
      await withFormattingFixture(DATA.formattableTypeScriptContent, async (fixture) => {
        await writeFixtureFile(
          fixture.productDir,
          DATA.narrowedScopeTypeScriptSourcePath,
          DATA.unformattedTypeScriptContent,
        );
        await writeValidationPathFilters(fixture.productDir, { exclude: [DATA.narrowedScopeDirectoryName] });

        const result = await runValidationSubprocess([
          validationCliDefinition.subcommands.format.commandName,
          DATA.narrowedScopeTypeScriptSourcePath,
        ], {
          cwd: fixture.productDir,
        });

        expect(result.exitCode).toBe(DATA.failureExitCode);
        expect(result.stderr).toContain(DATA.narrowedScopeTypeScriptSourcePath);
      });
    },
    FORMATTING_HARNESS_TIMEOUT,
  );

  it(
    "hands dprint the explicit directory scope without wrapper filtering",
    async () => {
      await withFormattingFixture(DATA.formattableTypeScriptContent, async (fixture) => {
        await writeFixtureFile(
          fixture.productDir,
          DATA.narrowedScopeTypeScriptSourcePath,
          DATA.unformattedTypeScriptContent,
        );
        await writeFixtureFile(
          fixture.productDir,
          DATA.secondaryScopeTypeScriptSourcePath,
          DATA.unformattedTypeScriptContent,
        );
        await writeValidationPathFilters(fixture.productDir, {
          include: [DATA.narrowedScopeDirectoryName, DATA.secondaryScopeDirectoryName],
        });

        const result = await runValidationSubprocess([
          validationCliDefinition.subcommands.format.commandName,
          DATA.narrowedScopeDirectoryName,
        ], {
          cwd: fixture.productDir,
        });
        const contexts = await recordFormattingContexts({
          cwd: fixture.productDir,
          files: [DATA.narrowedScopeDirectoryName],
        });

        expect(result.exitCode).toBe(DATA.failureExitCode);
        expect(result.stderr).toContain(DATA.narrowedScopeTypeScriptSourcePath);
        expect(result.stderr).not.toContain(DATA.secondaryScopeTypeScriptSourcePath);
        expect(contexts.map((context) => ({ files: context.files, excludes: context.excludes }))).toEqual([
          { files: [`${DATA.narrowedScopeDirectoryName}/${DATA.recursiveDirectoryGlob}`], excludes: [] },
        ]);
      });
    },
    FORMATTING_HARNESS_TIMEOUT,
  );

  it(
    "checks descendants of a directory operand that the validation excludes name",
    async () => {
      await withFormattingFixture(DATA.formattableTypeScriptContent, async (fixture) => {
        await writeFixtureFile(
          fixture.productDir,
          DATA.narrowedScopeTypeScriptSourcePath,
          DATA.unformattedTypeScriptContent,
        );
        await writeFixtureFile(
          fixture.productDir,
          DATA.excludedScopeTypeScriptSourcePath,
          DATA.unformattedTypeScriptContent,
        );
        await writeValidationPathFilters(fixture.productDir, {
          include: [DATA.narrowedScopeDirectoryName],
          exclude: [`${DATA.narrowedScopeDirectoryName}/${DATA.excludedScopeDirectoryName}`],
        });

        const result = await runValidationSubprocess([
          validationCliDefinition.subcommands.format.commandName,
          DATA.narrowedScopeDirectoryName,
        ], {
          cwd: fixture.productDir,
        });

        expect(result.exitCode).toBe(DATA.failureExitCode);
        expect(result.stderr).toContain(DATA.narrowedScopeTypeScriptSourcePath);
        expect(result.stderr).toContain(DATA.excludedScopeTypeScriptSourcePath);
      });
    },
    FORMATTING_HARNESS_TIMEOUT,
  );
});
