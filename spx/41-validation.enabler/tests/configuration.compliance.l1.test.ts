import { describe, expect, it } from "vitest";

import type { KnipCommandOptions } from "@/commands/validation";
import { knipCommand } from "@/commands/validation/knip";
import { LITERAL_DISABLED_MESSAGE, literalCommand } from "@/commands/validation/literal";
import { markdownCommand } from "@/commands/validation/markdown";
import {
  formatValidationPathsNoTargetsSkipMessage,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_EXIT_CODES,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "@/commands/validation/messages";
import { resolveConfig } from "@/config/index";
import {
  VALIDATION_ENABLED_FIELD,
  VALIDATION_KNIP_SUBSECTION,
  VALIDATION_LITERAL_SUBSECTION,
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  VALIDATION_PATHS_SUBSECTION,
  type ValidationConfig,
  validationConfigDescriptor,
} from "@/validation/config/descriptor";
import { LITERAL_DEFAULTS } from "@/validation/literal/config";
import { TOOL_DISCOVERY } from "@/validation/discovery/constants";
import { runKnipStage, type KnipStageDeps } from "@/validation/languages/typescript";
import { type ScopeConfig, VALIDATION_SCOPES } from "@/validation/types";
import { MARKDOWN_DEFAULT_DIRECTORY_NAMES, MARKDOWN_PRIMARY_FILE_EXTENSION } from "@/validation/steps/markdown";
import {
  LITERAL_TEST_GENERATOR,
  sampleDistinctDomainLiterals,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";
import { type Config } from "@testing/harnesses/spec-tree/spec-tree";

function validationConfigSection(section: string, enabled: boolean): Config {
  return {
    [validationConfigDescriptor.section]: {
      [section]: {
        [VALIDATION_ENABLED_FIELD]: enabled,
      },
    },
  };
}

describe("ALWAYS: validation command participation is driven by spx config", () => {
  it("resolves literal enabled and knip disabled from descriptor defaults", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const resolved = await resolveConfig(env.productDir, [validationConfigDescriptor]);

      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        const validationConfig = resolved.value[validationConfigDescriptor.section] as ValidationConfig;
        expect(validationConfig.literal.enabled).toBe(true);
        expect(validationConfig.knip.enabled).toBe(false);
      }
    });
  });

  it("skips literal validation when validation.literal.enabled is false", async () => {
    await withLiteralFixtureEnv(
      validationConfigSection(VALIDATION_LITERAL_SUBSECTION, false),
      async (env) => {
        await env.writeTsConfigMarker();

        const result = await literalCommand({ cwd: env.productDir });

        expect(result.exitCode).toBe(0);
        expect(result.output).toBe(LITERAL_DISABLED_MESSAGE);
      },
    );
  });

  it("skips injected literal config when injected enabled is false", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      await env.writeTsConfigMarker();

      const result = await literalCommand({
        cwd: env.productDir,
        config: LITERAL_DEFAULTS,
        enabled: false,
      });

      expect(result.exitCode).toBe(0);
      expect(result.output).toBe(LITERAL_DISABLED_MESSAGE);
    });
  });

  it("skips knip validation when validation.knip.enabled is false", async () => {
    await withLiteralFixtureEnv(
      validationConfigSection(VALIDATION_KNIP_SUBSECTION, false),
      async (env) => {
        const result = await knipCommand({ cwd: env.productDir });

        expect(result.exitCode).toBe(0);
        expect(result.output).toBe(VALIDATION_COMMAND_OUTPUT.KNIP_DISABLED);
      },
    );
  });

  it("applies explicit file scope during knip execution", async () => {
    await withLiteralFixtureEnv(
      validationConfigSection(VALIDATION_KNIP_SUBSECTION, true),
      async (env) => {
        const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
        const validationCalls: Array<{
          readonly projectRoot: string;
          readonly typescriptScope: ScopeConfig;
        }> = [];
        await env.writeTsConfigMarker();
        await env.writeSourceFile(sourceFilePath, sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral()));

        const result = await knipCommand(
          {
            cwd: env.productDir,
            files: [sourceFilePath],
          },
          {
            discoverTool: async () => ({
              found: true,
              location: {
                tool: VALIDATION_PIPELINE_DATA.stageNames.KNIP,
                path: env.productDir,
                source: TOOL_DISCOVERY.SOURCES.PROJECT,
              },
            }),
            validateKnip: async (context) => {
              validationCalls.push(context);
              return { success: true };
            },
          },
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
      },
    );
  });

  it("applies production scope during knip execution", async () => {
    await withLiteralFixtureEnv(
      validationConfigSection(VALIDATION_KNIP_SUBSECTION, true),
      async (env) => {
        const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
        const testFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.testFilePath());
        const validationCalls: Array<{
          readonly projectRoot: string;
          readonly typescriptScope: ScopeConfig;
        }> = [];
        await env.writeTsConfigMarker();
        await env.writeRaw(
          VALIDATION_PIPELINE_DATA.productionTsconfigFile,
          VALIDATION_PIPELINE_DATA.productionTsconfigContent,
        );
        await env.writeSourceFile(sourceFilePath, sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral()));
        await env.writeTestFile(testFilePath, sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral()));

        const result = await knipCommand(
          {
            cwd: env.productDir,
            scope: VALIDATION_SCOPES.PRODUCTION,
          },
          {
            discoverTool: async () => ({
              found: true,
              location: {
                tool: VALIDATION_PIPELINE_DATA.stageNames.KNIP,
                path: env.productDir,
                source: TOOL_DISCOVERY.SOURCES.PROJECT,
              },
            }),
            validateKnip: async (context) => {
              validationCalls.push(context);
              return { success: true };
            },
          },
        );

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect(validationCalls).toHaveLength(1);
        expect(validationCalls[0]?.typescriptScope.filePatterns).toEqual([
          VALIDATION_PIPELINE_DATA.productionScopeFilePattern,
        ]);
        expect(validationCalls[0]?.typescriptScope.directories).toEqual([
          VALIDATION_PIPELINE_DATA.sourceDirectoryName,
        ]);
      },
    );
  });

  it("reports a knip skip when explicit file scope matches no targets", async () => {
    await withLiteralFixtureEnv(
      validationConfigSection(VALIDATION_KNIP_SUBSECTION, true),
      async (env) => {
        const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
        const validationCalls: Array<{
          readonly projectRoot: string;
          readonly typescriptScope: ScopeConfig;
        }> = [];
        await env.writeTsConfigMarker();

        const result = await knipCommand(
          {
            cwd: env.productDir,
            files: [sourceFilePath],
          },
          {
            discoverTool: async () => ({
              found: true,
              location: {
                tool: VALIDATION_PIPELINE_DATA.stageNames.KNIP,
                path: env.productDir,
                source: TOOL_DISCOVERY.SOURCES.PROJECT,
              },
            }),
            validateKnip: async (context) => {
              validationCalls.push(context);
              return { success: true };
            },
          },
        );

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect(result.output).toBe(formatValidationPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.KNIP));
        expect(validationCalls).toEqual([]);
      },
    );
  });

  it("threads aggregate validation file scope to the knip stage", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
      const commandCalls: KnipCommandOptions[] = [];
      const deps: KnipStageDeps = {
        knipCommand: async (options) => {
          commandCalls.push(options);
          return { exitCode: VALIDATION_EXIT_CODES.SUCCESS, output: VALIDATION_COMMAND_OUTPUT.KNIP_SUCCESS };
        },
      };

      const result = await runKnipStage(
        {
          cwd: env.productDir,
          scope: VALIDATION_SCOPES.PRODUCTION,
          files: [sourceFilePath],
          quiet: true,
          json: true,
        },
        deps,
      );

      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
      expect(commandCalls).toEqual([
        {
          cwd: env.productDir,
          scope: VALIDATION_SCOPES.PRODUCTION,
          files: [sourceFilePath],
          quiet: true,
          json: true,
        },
      ]);
    });
  });

  it("resolves per-tool validation path configuration through the descriptor", async () => {
    await withLiteralFixtureEnv(
      {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: {
            [VALIDATION_PATH_TOOL_SUBSECTIONS.ESLINT]: {
              include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
            },
          },
        },
      },
      async (env) => {
        const resolved = await resolveConfig(env.productDir, [validationConfigDescriptor]);

        expect(resolved.ok).toBe(true);
        if (resolved.ok) {
          const validationConfig = resolved.value[validationConfigDescriptor.section] as ValidationConfig;
          expect(validationConfig.paths.eslint?.include).toEqual([VALIDATION_PIPELINE_DATA.sourceDirectoryName]);
          expect(validationConfig.paths.knip).toBeUndefined();
        }
      },
    );
  });

  it("applies literal-specific validation paths during literal execution", async () => {
    await withLiteralFixtureEnv(
      {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: {
            [VALIDATION_PATH_TOOL_SUBSECTIONS.LITERAL]: {
              include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
            },
          },
        },
      },
      async (env) => {
        const [reuseLiteral] = sampleDistinctDomainLiterals(1);
        const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
        const testFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.testFilePath());
        await env.writeTsConfigMarker();
        await env.writeSourceFile(sourceFilePath, reuseLiteral);
        await env.writeTestFile(testFilePath, reuseLiteral);

        const result = await literalCommand({ cwd: env.productDir, json: true });

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect(JSON.parse(result.output)).toEqual({ srcReuse: [], testDupe: [] });
      },
    );
  });

  it("applies markdown-specific validation paths during markdown execution", async () => {
    await withLiteralFixtureEnv(
      {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: {
            [VALIDATION_PATH_TOOL_SUBSECTIONS.MARKDOWN]: {
              include: ["spx"],
            },
          },
        },
      },
      async (env) => {
        const [validMarkdownSlug, invalidMarkdownSlug] = sampleDistinctDomainLiterals(2);
        const [specTreeDirectory, docsDirectory] = MARKDOWN_DEFAULT_DIRECTORY_NAMES;
        await env.writeRaw(`${specTreeDirectory}/${validMarkdownSlug}${MARKDOWN_PRIMARY_FILE_EXTENSION}`, "# Good\n");
        await env.writeRaw(`${docsDirectory}/${invalidMarkdownSlug}${MARKDOWN_PRIMARY_FILE_EXTENSION}`, "# Bad  \n");

        const result = await markdownCommand({ cwd: env.productDir, quiet: true });

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
      },
    );
  });
});
