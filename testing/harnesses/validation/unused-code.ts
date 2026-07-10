import { expect } from "vitest";

import { knipCommand } from "@/commands/validation/knip";
import {
  formatTypeScriptAbsentSkipMessage,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_EXIT_CODES,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "@/commands/validation/messages";
import { VALIDATION_KNIP_SUBSECTION } from "@/validation/config/descriptor";
import { KNIP_COMMAND_TOKENS } from "@/validation/steps/knip";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";
import { validationConfigSection } from "@testing/harnesses/validation/configuration";
import { createRecordingKnipCommandDeps, type KnipValidationCall } from "@testing/harnesses/validation/knip-support";
import { RecordingSpawnOptionsRunner } from "@testing/harnesses/validation/subprocess";
import { collectHarnessTestCases, describe, it } from "@testing/harnesses/vitest-registration";

export const unusedCodeScenarioCases = collectHarnessTestCases(() => {
  describe("Knip unused-code scenarios", () => {
    it("runs Knip for an enabled TypeScript project", async () => {
      await withLiteralFixtureEnv(
        validationConfigSection(VALIDATION_KNIP_SUBSECTION, true),
        async (env) => {
          const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
          const validationCalls: KnipValidationCall[] = [];
          const runner = new RecordingSpawnOptionsRunner();
          await env.writeTsConfigMarker();
          await env.writeSourceFile(
            sourceFilePath,
            sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral()),
          );

          const result = await knipCommand(
            { cwd: env.productDir, files: [sourceFilePath] },
            createRecordingKnipCommandDeps(env.productDir, validationCalls, runner),
          );

          expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
          expect(result.output).toBe(VALIDATION_COMMAND_OUTPUT.KNIP_SUCCESS);
          expect(validationCalls).toHaveLength(1);
          expect(runner.commands).toEqual([KNIP_COMMAND_TOKENS.NPX_COMMAND]);
          expect(runner.args[0]?.[0]).toBe(KNIP_COMMAND_TOKENS.COMMAND);
        },
      );
    });

    it("reports configured Knip disablement", async () => {
      await withLiteralFixtureEnv(
        validationConfigSection(VALIDATION_KNIP_SUBSECTION, false),
        async (env) => {
          const validationCalls: KnipValidationCall[] = [];
          await env.writeTsConfigMarker();

          const result = await knipCommand(
            { cwd: env.productDir },
            createRecordingKnipCommandDeps(env.productDir, validationCalls),
          );

          expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
          expect(result.output).toBe(VALIDATION_COMMAND_OUTPUT.KNIP_DISABLED);
          expect(validationCalls).toHaveLength(0);
        },
      );
    });
  });
});

export const unusedCodeComplianceCases = collectHarnessTestCases(() => {
  describe("Knip unused-code compliance", () => {
    it("stops before Knip discovery when TypeScript is absent", async () => {
      await withLiteralFixtureEnv(
        validationConfigSection(VALIDATION_KNIP_SUBSECTION, true),
        async (env) => {
          const validationCalls: KnipValidationCall[] = [];

          const result = await knipCommand(
            { cwd: env.productDir },
            createRecordingKnipCommandDeps(env.productDir, validationCalls),
          );

          expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
          expect(result.output).toBe(
            formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.KNIP),
          );
          expect(validationCalls).toHaveLength(0);
        },
      );
    });

    it("forwards explicit TypeScript file scope to Knip", async () => {
      await withLiteralFixtureEnv(
        validationConfigSection(VALIDATION_KNIP_SUBSECTION, true),
        async (env) => {
          const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
          const validationCalls: KnipValidationCall[] = [];
          await env.writeTsConfigMarker();
          await env.writeSourceFile(
            sourceFilePath,
            sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral()),
          );

          const result = await knipCommand(
            { cwd: env.productDir, files: [sourceFilePath] },
            createRecordingKnipCommandDeps(env.productDir, validationCalls),
          );

          expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
          expect(validationCalls).toEqual([
            {
              projectRoot: env.productDir,
              typescriptScope: {
                directories: [],
                filePatterns: [sourceFilePath],
                excludePatterns: [],
                filteredByValidationPaths: true,
                filteredByValidationPathIncludes: true,
                filteredByValidationPathNoMatches: false,
              },
            },
          ]);
          expect(result.output).toBe(VALIDATION_COMMAND_OUTPUT.KNIP_SUCCESS);
          expect(VALIDATION_PIPELINE_DATA.stageNames.KNIP).toBe(VALIDATION_STAGE_DISPLAY_NAMES.KNIP);
        },
      );
    });
  });
});
