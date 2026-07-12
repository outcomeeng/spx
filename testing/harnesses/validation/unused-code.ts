import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { KNIP_VALIDATION_STEP_NAME, knipCommand, type KnipCommandDeps } from "@/commands/validation/knip";
import {
  formatTypeScriptAbsentSkipMessage,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_EXIT_CODES,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "@/commands/validation/messages";
import {
  VALIDATION_ENABLED_FIELD,
  VALIDATION_KNIP_SUBSECTION,
  validationConfigDescriptor,
} from "@/validation/config/descriptor";
import { TOOL_DISCOVERY } from "@/validation/discovery/constants";
import { KNIP_COMMAND_TOKENS, type KnipValidationContext, validateKnip } from "@/validation/steps/knip";
import type { ScopeConfig } from "@/validation/types";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { RejectingUnexpectedValidationSpawnRunner } from "@testing/harnesses/validation/subprocess";

interface KnipCommandRecording {
  readonly discoveryCalls: string[];
  readonly validationCalls: KnipValidationContext[];
  readonly deps: KnipCommandDeps;
}

function knipValidationConfig(enabled: boolean): Config {
  return {
    [validationConfigDescriptor.section]: {
      [VALIDATION_KNIP_SUBSECTION]: {
        [VALIDATION_ENABLED_FIELD]: enabled,
      },
    },
  };
}

function createKnipCommandRecording(
  productDir: string,
  validationResult: Awaited<ReturnType<KnipCommandDeps["validateKnip"]>> = { success: true },
): KnipCommandRecording {
  const discoveryCalls: string[] = [];
  const validationCalls: KnipValidationContext[] = [];

  return {
    discoveryCalls,
    validationCalls,
    deps: {
      discoverTool: async (tool) => {
        discoveryCalls.push(tool);
        return {
          found: true,
          location: {
            tool: KNIP_COMMAND_TOKENS.COMMAND,
            path: productDir,
            source: TOOL_DISCOVERY.SOURCES.PROJECT,
          },
        };
      },
      validateKnip: async (context) => {
        validationCalls.push(context);
        return validationResult;
      },
    },
  };
}

function createUnavailableKnipCommandRecording(): KnipCommandRecording {
  const discoveryCalls: string[] = [];
  const validationCalls: KnipValidationContext[] = [];

  return {
    discoveryCalls,
    validationCalls,
    deps: {
      discoverTool: async (tool) => {
        discoveryCalls.push(tool);
        return {
          found: false,
          notFound: {
            tool: KNIP_COMMAND_TOKENS.COMMAND,
            reason: TOOL_DISCOVERY.MESSAGES.NOT_FOUND_REASON(KNIP_COMMAND_TOKENS.COMMAND),
          },
        };
      },
      validateKnip: async (context) => {
        validationCalls.push(context);
        return { success: true };
      },
    },
  };
}

function expectedExplicitScope(sourceFilePath: string): ScopeConfig {
  return {
    directories: [],
    filePatterns: [sourceFilePath],
    excludePatterns: [],
    filteredByValidationPaths: true,
    filteredByValidationPathIncludes: true,
    filteredByValidationPathNoMatches: false,
  };
}

export function registerUnusedCodeScenarioTests(): void {
  describe("Knip unused-code validation", () => {
    it("skips before discovery when TypeScript is absent", async () => {
      await withLiteralFixtureEnv(knipValidationConfig(true), async (env) => {
        const recording = createKnipCommandRecording(env.productDir);

        const result = await knipCommand({ cwd: env.productDir }, recording.deps);

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect(result.output).toBe(formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.KNIP));
        expect(recording.discoveryCalls).toEqual([]);
        expect(recording.validationCalls).toEqual([]);
      });
    });

    it("skips before discovery when Knip is disabled", async () => {
      await withLiteralFixtureEnv(knipValidationConfig(false), async (env) => {
        const recording = createKnipCommandRecording(env.productDir);
        await env.writeTsConfigMarker();

        const result = await knipCommand({ cwd: env.productDir }, recording.deps);

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect(result.output).toBe(VALIDATION_COMMAND_OUTPUT.KNIP_DISABLED);
        expect(recording.discoveryCalls).toEqual([]);
        expect(recording.validationCalls).toEqual([]);
      });
    });

    it("skips execution when Knip is unavailable", async () => {
      await withLiteralFixtureEnv(knipValidationConfig(true), async (env) => {
        const recording = createUnavailableKnipCommandRecording();
        await env.writeTsConfigMarker();

        const result = await knipCommand({ cwd: env.productDir }, recording.deps);

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect(result.output).toBe(
          TOOL_DISCOVERY.MESSAGES.SKIP_FORMAT(KNIP_VALIDATION_STEP_NAME, KNIP_COMMAND_TOKENS.COMMAND),
        );
        expect(recording.discoveryCalls).toEqual([KNIP_COMMAND_TOKENS.COMMAND]);
        expect(recording.validationCalls).toEqual([]);
      });
    });

    it("reports success when Knip finds no unused code", async () => {
      await withLiteralFixtureEnv(knipValidationConfig(true), async (env) => {
        const recording = createKnipCommandRecording(env.productDir);
        const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
        await env.writeTsConfigMarker();
        await env.writeSourceFile(sourceFilePath, sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral()));

        const result = await knipCommand({ cwd: env.productDir }, recording.deps);

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect(result.output).toBe(VALIDATION_COMMAND_OUTPUT.KNIP_SUCCESS);
        expect(recording.validationCalls).toHaveLength(1);
      });
    });

    it("reports Knip failure details", async () => {
      await withLiteralFixtureEnv(knipValidationConfig(true), async (env) => {
        const failureDetail = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
        const recording = createKnipCommandRecording(env.productDir, { success: false, error: failureDetail });
        const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
        await env.writeTsConfigMarker();
        await env.writeSourceFile(sourceFilePath, sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral()));

        const result = await knipCommand({ cwd: env.productDir }, recording.deps);

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.FAILURE);
        expect(result.output).toBe(failureDetail);
        expect(recording.validationCalls).toHaveLength(1);
      });
    });

    it("forwards an explicit TypeScript file as the complete Knip scope", async () => {
      await withLiteralFixtureEnv(knipValidationConfig(true), async (env) => {
        const recording = createKnipCommandRecording(env.productDir);
        const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
        await env.writeTsConfigMarker();
        await env.writeSourceFile(sourceFilePath, sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral()));

        const result = await knipCommand(
          { cwd: env.productDir, files: [sourceFilePath] },
          recording.deps,
        );

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect(recording.validationCalls).toEqual([
          {
            productDir: env.productDir,
            typescriptScope: expectedExplicitScope(sourceFilePath),
            toolPath: env.productDir,
          },
        ]);
      });
    });
  });
}

export function registerUnusedCodeComplianceTests(): void {
  describe("Knip executable ownership", () => {
    it("spawns the product executable returned by discovery", async () => {
      await withLiteralFixtureEnv(knipValidationConfig(true), async (env) => {
        const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
        const toolPath = join(env.productDir, sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath()));
        const runner = new RejectingUnexpectedValidationSpawnRunner({ command: toolPath });
        const deps: KnipCommandDeps = {
          discoverTool: async (tool) => ({
            found: true,
            location: { tool, path: toolPath, source: TOOL_DISCOVERY.SOURCES.GLOBAL },
          }),
          validateKnip: (context) => validateKnip(context, runner),
        };
        await env.writeTsConfigMarker();
        await env.writeSourceFile(sourceFilePath, sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral()));

        const result = await knipCommand({ cwd: env.productDir, quiet: true }, deps);

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect(runner.commands).toEqual([toolPath]);
      });
    });
  });
}
