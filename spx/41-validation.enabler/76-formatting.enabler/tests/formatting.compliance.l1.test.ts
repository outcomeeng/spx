import { describe, expect, it } from "vitest";

import { FORMATTING_COMMAND_OUTPUT, formattingCommand } from "@/commands/validation/formatting";
import { type FormattingValidationContext, validateFormatting } from "@/validation/steps/formatting";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { FORMATTING_VALIDATION_DATA as DATA } from "@testing/generators/validation/formatting";
import {
  EXPECTED_DPRINT_COMMAND,
  FORMATTING_HARNESS_TIMEOUT,
  RecordingFormattingWritable,
  runFormattingWithoutConfig,
  withFormattingFixtureFiles,
  writeValidationPathFilters,
} from "@testing/harnesses/validation/formatting";
import { RecordingSpawnOptionsRunner } from "@testing/harnesses/validation/subprocess";

describe("dprint subprocess output", () => {
  it("forwards stdout and stderr once each while capturing both, from the supplied product directory", async () => {
    const stdoutChunk = sampleLiteralTestValue(arbitraryDomainLiteral());
    const stderrChunk = sampleLiteralTestValue(arbitraryDomainLiteral());
    const runner = new RecordingSpawnOptionsRunner({ script: { stdout: stdoutChunk, stderr: stderrChunk } });
    const stdout = new RecordingFormattingWritable();
    const stderr = new RecordingFormattingWritable();
    const productDir = process.cwd();

    const result = await validateFormatting({ productDir }, runner, { stdout, stderr });

    expect(result.output).toBe(`${stdoutChunk}${stderrChunk}`);
    expect(stdout.chunks).toEqual([stdoutChunk]);
    expect(stderr.chunks).toEqual([stderrChunk]);
    expect(runner.commands).toEqual([EXPECTED_DPRINT_COMMAND]);
    expect(runner.args).toEqual([[DATA.expectedDprintCheckSubcommand]]);
    expect(runner.spawnOptions?.cwd).toBe(productDir);
  });
});

describe("automatic formatting scope", () => {
  it(
    "forwards each configured validation exclude as a dprint --excludes value",
    async () => {
      await withFormattingFixtureFiles(async (productDir) => {
        await writeValidationPathFilters(productDir, { exclude: [DATA.narrowedScopeDirectoryName] });
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

        expect(result.exitCode).toBe(DATA.passExitCode);
        expect(contexts.map((context) => ({ productDir: context.productDir, excludes: context.excludes })))
          .toEqual([{ productDir, excludes: [DATA.narrowedScopeDirectoryName] }]);
        expect(runner.args).toEqual([
          [DATA.expectedDprintCheckSubcommand, DATA.expectedDprintExcludesOption, DATA.narrowedScopeDirectoryName],
        ]);
      });
    },
    FORMATTING_HARNESS_TIMEOUT,
  );
});

describe("a product without dprint.jsonc", () => {
  it("skips formatting and exits 0 without invoking dprint", async () => {
    const contexts: FormattingValidationContext[] = [];

    const result = await runFormattingWithoutConfig({
      validateFormatting: async (context) => {
        contexts.push(context);
        return { success: false, output: FORMATTING_COMMAND_OUTPUT.FAILURE_SUMMARY };
      },
    });

    expect(result.exitCode).toBe(DATA.passExitCode);
    expect(result.output).toContain(FORMATTING_COMMAND_OUTPUT.NO_CONFIG_SKIP_REASON);
    expect(contexts).toEqual([]);
  });
});
