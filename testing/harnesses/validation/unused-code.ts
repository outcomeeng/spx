import { expect } from "vitest";

import { KNIP_VALIDATION_STEP_NAME, knipCommand } from "@/commands/validation/knip";
import {
  formatTypeScriptAbsentSkipMessage,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_EXIT_CODES,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "@/commands/validation/messages";
import { VALIDATION_KNIP_SUBSECTION } from "@/validation/config/descriptor";
import { TOOL_DISCOVERY } from "@/validation/discovery/constants";
import { KNIP_COMMAND_TOKENS, KNIP_LOCAL_BIN_SEGMENTS } from "@/validation/steps/knip";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";
import { validationConfigSection } from "@testing/harnesses/validation/configuration";
import {
  createRecordingKnipCommandDeps,
  type KnipDiscoveryCall,
  type KnipValidationCall,
  OutputRecordingSpawnOptionsRunner,
  ScopedKnipRecordingRunner,
} from "@testing/harnesses/validation/knip-support";
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
          expect(runner.commands).toEqual([join(env.productDir, ...KNIP_LOCAL_BIN_SEGMENTS)]);
        },
      );
    });

    it("reports configured Knip disablement", async () => {
      await withLiteralFixtureEnv(
        validationConfigSection(VALIDATION_KNIP_SUBSECTION, false),
        async (env) => {
          const validationCalls: KnipValidationCall[] = [];
          const discoveryCalls: KnipDiscoveryCall[] = [];
          await env.writeTsConfigMarker();

          const result = await knipCommand(
            { cwd: env.productDir },
            createRecordingKnipCommandDeps(
              env.productDir,
              validationCalls,
              new RecordingSpawnOptionsRunner(),
              discoveryCalls,
            ),
          );

          expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
          expect(result.output).toBe(VALIDATION_COMMAND_OUTPUT.KNIP_DISABLED);
          expect(validationCalls).toHaveLength(0);
          expect(discoveryCalls).toHaveLength(0);
        },
      );
    });

    it("stops before Knip discovery when TypeScript is absent", async () => {
      await withLiteralFixtureEnv(
        validationConfigSection(VALIDATION_KNIP_SUBSECTION, true),
        async (env) => {
          const validationCalls: KnipValidationCall[] = [];
          const discoveryCalls: KnipDiscoveryCall[] = [];

          const result = await knipCommand(
            { cwd: env.productDir },
            createRecordingKnipCommandDeps(
              env.productDir,
              validationCalls,
              new RecordingSpawnOptionsRunner(),
              discoveryCalls,
            ),
          );

          expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
          expect(result.output).toBe(
            formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.KNIP),
          );
          expect(validationCalls).toHaveLength(0);
          expect(discoveryCalls).toHaveLength(0);
        },
      );
    });

    it("forwards explicit TypeScript file scope to Knip", async () => {
      await withLiteralFixtureEnv(
        validationConfigSection(VALIDATION_KNIP_SUBSECTION, true),
        async (env) => {
          const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
          const validationCalls: KnipValidationCall[] = [];
          const runner = new ScopedKnipRecordingRunner();
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
          expect(validationCalls).toEqual([
            {
              productDir: env.productDir,
              toolPath: join(env.productDir, ...KNIP_LOCAL_BIN_SEGMENTS),
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
          expect(runner.scopedIncludes).toEqual([[join(env.productDir, sourceFilePath)]]);
          expect(VALIDATION_PIPELINE_DATA.stageNames.KNIP).toBe(VALIDATION_STAGE_DISPLAY_NAMES.KNIP);
        },
      );
    });

    it("reports unavailable Knip without running validation", async () => {
      await withLiteralFixtureEnv(
        validationConfigSection(VALIDATION_KNIP_SUBSECTION, true),
        async (env) => {
          const validationCalls: KnipValidationCall[] = [];
          await env.writeTsConfigMarker();
          const deps = createRecordingKnipCommandDeps(env.productDir, validationCalls);

          const result = await knipCommand(
            { cwd: env.productDir },
            {
              ...deps,
              discoverTool: async () => ({
                found: false,
                notFound: {
                  tool: KNIP_COMMAND_TOKENS.COMMAND,
                  reason: TOOL_DISCOVERY.MESSAGES.NOT_FOUND_REASON(KNIP_COMMAND_TOKENS.COMMAND),
                },
              }),
            },
          );

          expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
          expect(result.output).toBe(
            TOOL_DISCOVERY.MESSAGES.SKIP_FORMAT(
              KNIP_VALIDATION_STEP_NAME,
              KNIP_COMMAND_TOKENS.COMMAND,
            ),
          );
          expect(validationCalls).toHaveLength(0);
        },
      );
    });

    it("reports Knip subprocess failure details", async () => {
      await withLiteralFixtureEnv(
        validationConfigSection(VALIDATION_KNIP_SUBSECTION, true),
        async (env) => {
          const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
          const failureDetail = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
          const validationCalls: KnipValidationCall[] = [];
          const runner = new OutputRecordingSpawnOptionsRunner(
            failureDetail,
            VALIDATION_EXIT_CODES.FAILURE,
          );
          await env.writeTsConfigMarker();
          await env.writeSourceFile(
            sourceFilePath,
            sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral()),
          );

          const result = await knipCommand(
            { cwd: env.productDir, files: [sourceFilePath] },
            createRecordingKnipCommandDeps(env.productDir, validationCalls, runner),
          );

          expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.FAILURE);
          expect(result.output).toBe(failureDetail);
          expect(validationCalls).toHaveLength(1);
        },
      );
    });
  });
});

export const unusedCodeComplianceCases = collectHarnessTestCases(() => {
  describe("Knip unused-code compliance", () => {
    it("spawns the executable path returned by discovery", async () => {
      await withLiteralFixtureEnv(
        validationConfigSection(VALIDATION_KNIP_SUBSECTION, true),
        async (env) => {
          const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
          const discoveredToolPath = join(
            env.productDir,
            sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral()),
            KNIP_COMMAND_TOKENS.COMMAND,
          );
          const validationCalls: KnipValidationCall[] = [];
          const runner = new RecordingSpawnOptionsRunner();
          await env.writeTsConfigMarker();
          await env.writeSourceFile(
            sourceFilePath,
            sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral()),
          );

          const result = await knipCommand(
            { cwd: env.productDir, files: [sourceFilePath] },
            createRecordingKnipCommandDeps(
              env.productDir,
              validationCalls,
              runner,
              [],
              discoveredToolPath,
            ),
          );

          expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
          expect(runner.commands).toEqual([discoveredToolPath]);
        },
      );
    });
  });
});
import { join } from "node:path";
