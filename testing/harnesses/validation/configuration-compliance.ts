import { posix } from "node:path";
import { describe, expect, it } from "vitest";

import type { KnipCommandOptions } from "@/commands/validation";
import { LITERAL_DISABLED_MESSAGE, literalCommand } from "@/commands/validation/literal";
import { MARKDOWN_COMMAND_OUTPUT, markdownCommand } from "@/commands/validation/markdown";
import { VALIDATION_COMMAND_OUTPUT, VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import { resolveConfig } from "@/config/index";
import { NODE_STATUS_EXCLUDE_FILENAME } from "@/lib/node-status/exclude";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import {
  VALIDATION_LITERAL_SUBSECTION,
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  VALIDATION_PATHS_SUBSECTION,
  type ValidationConfig,
  validationConfigDescriptor,
} from "@/validation/config/descriptor";
import { type KnipStageDeps, runKnipStage } from "@/validation/languages/typescript";
import { LITERAL_DEFAULTS } from "@/validation/literal/config";
import { MARKDOWN_DEFAULT_DIRECTORY_NAMES, MARKDOWN_PRIMARY_FILE_EXTENSION } from "@/validation/steps/markdown";
import { VALIDATION_SCOPES } from "@/validation/types";
import {
  LITERAL_TEST_GENERATOR,
  sampleDistinctDomainLiterals,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { MARKDOWN_VALIDATION_DATA } from "@testing/generators/validation/markdown";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { type LiteralFixtureEnv, withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";
import { validationConfigSection } from "@testing/harnesses/validation/configuration";

type LiteralFixtureConfig = Parameters<typeof withLiteralFixtureEnv>[0];

function markdownValidationPathsConfig(
  paths: { readonly include?: readonly string[]; readonly exclude?: readonly string[] },
): LiteralFixtureConfig {
  return {
    [validationConfigDescriptor.section]: {
      [VALIDATION_PATHS_SUBSECTION]: {
        [VALIDATION_PATH_TOOL_SUBSECTIONS.MARKDOWN]: paths,
      },
    },
  };
}

async function writeDefaultMarkdownPair(
  env: LiteralFixtureEnv,
  invalidContent: string,
): Promise<void> {
  const [validMarkdownSlug, invalidMarkdownSlug] = sampleDistinctDomainLiterals(2);
  const [specTreeDirectory, docsDirectory] = MARKDOWN_DEFAULT_DIRECTORY_NAMES;
  await env.writeRaw(
    `${specTreeDirectory}/${validMarkdownSlug}${MARKDOWN_PRIMARY_FILE_EXTENSION}`,
    MARKDOWN_VALIDATION_DATA.validMarkdownTargetContent,
  );
  await env.writeRaw(
    `${docsDirectory}/${invalidMarkdownSlug}${MARKDOWN_PRIMARY_FILE_EXTENSION}`,
    invalidContent,
  );
}

async function runExplicitMarkdownOperandBypassingExclude(
  directoryOperand: boolean,
): Promise<Awaited<ReturnType<typeof markdownCommand>>> {
  const [excludedDirectoryName, childDirectoryName, markdownFileStem] = sampleDistinctDomainLiterals(3);
  const excludedDirectory = posix.join(
    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    excludedDirectoryName,
  );
  const operand = directoryOperand
    ? posix.join(excludedDirectory, childDirectoryName)
    : posix.join(
      excludedDirectory,
      `${markdownFileStem}${MARKDOWN_PRIMARY_FILE_EXTENSION}`,
    );
  const markdownPath = directoryOperand
    ? posix.join(
      operand,
      `${markdownFileStem}${MARKDOWN_PRIMARY_FILE_EXTENSION}`,
    )
    : operand;

  return await withLiteralFixtureEnv(
    markdownValidationPathsConfig({ exclude: [excludedDirectory] }),
    async (env) => {
      await env.writeRaw(markdownPath, MARKDOWN_VALIDATION_DATA.brokenMarkdownContent);

      return await markdownCommand({
        cwd: env.productDir,
        files: [operand],
      });
    },
  );
}

describe("ALWAYS: validation command participation is driven by spx config", () => {
  it("resolves literal enabled and knip disabled from descriptor defaults", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const resolved = await resolveConfig(env.productDir, [
        validationConfigDescriptor,
      ]);

      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        const validationConfig = resolved.value[
          validationConfigDescriptor.section
        ] as ValidationConfig;
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

  it("threads aggregate validation file scope to the knip stage", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const sourceFilePath = sampleLiteralTestValue(
        LITERAL_TEST_GENERATOR.sourceFilePath(),
      );
      const commandCalls: KnipCommandOptions[] = [];
      const deps: KnipStageDeps = {
        knipCommand: async (options) => {
          commandCalls.push(options);
          return {
            exitCode: VALIDATION_EXIT_CODES.SUCCESS,
            output: VALIDATION_COMMAND_OUTPUT.KNIP_SUCCESS,
          };
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
        const resolved = await resolveConfig(env.productDir, [
          validationConfigDescriptor,
        ]);

        expect(resolved.ok).toBe(true);
        if (resolved.ok) {
          const validationConfig = resolved.value[
            validationConfigDescriptor.section
          ] as ValidationConfig;
          expect(validationConfig.paths.eslint?.include).toEqual([
            VALIDATION_PIPELINE_DATA.sourceDirectoryName,
          ]);
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
        const sourceFilePath = sampleLiteralTestValue(
          LITERAL_TEST_GENERATOR.sourceFilePath(),
        );
        const testFilePath = sampleLiteralTestValue(
          LITERAL_TEST_GENERATOR.testFilePath(),
        );
        await env.writeTsConfigMarker();
        await env.writeSourceFile(sourceFilePath, reuseLiteral);
        await env.writeTestFile(testFilePath, reuseLiteral);

        const result = await literalCommand({
          cwd: env.productDir,
          json: true,
        });

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect(JSON.parse(result.output)).toEqual({
          srcReuse: [],
          testDupe: [],
        });
      },
    );
  });

  it("applies markdown-specific validation paths during markdown execution", async () => {
    await withLiteralFixtureEnv(
      markdownValidationPathsConfig({
        include: [SPEC_TREE_CONFIG.ROOT_DIRECTORY],
      }),
      async (env) => {
        await writeDefaultMarkdownPair(env, MARKDOWN_VALIDATION_DATA.docsDirectFileMd024Content);

        const result = await markdownCommand({
          cwd: env.productDir,
          quiet: true,
        });

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
      },
    );
  });

  it("preserves explicit markdown root directory operands through markdown validation includes", async () => {
    await withLiteralFixtureEnv(
      markdownValidationPathsConfig({
        include: [SPEC_TREE_CONFIG.ROOT_DIRECTORY],
      }),
      async (env) => {
        await writeDefaultMarkdownPair(env, MARKDOWN_VALIDATION_DATA.brokenMarkdownContent);

        const result = await markdownCommand({
          cwd: env.productDir,
          files: ["."],
        });

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.FAILURE);
        expect(result.output).toContain(
          MARKDOWN_COMMAND_OUTPUT.ERROR_SUMMARY_SUFFIX,
        );
      },
    );
  });

  it("applies markdown validation excludes to explicit directory operands", async () => {
    await withLiteralFixtureEnv(
      {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: {
            [VALIDATION_PATH_TOOL_SUBSECTIONS.MARKDOWN]: {
              include: [SPEC_TREE_CONFIG.ROOT_DIRECTORY],
              exclude: ["spx/private"],
            },
          },
        },
      },
      async (env) => {
        await env.writeRaw("spx/good.md", "# Good\n");
        await env.writeRaw(
          "spx/private/bad.md",
          MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
        );

        const result = await markdownCommand({
          cwd: env.productDir,
          files: ["."],
        });

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect(result.output).toBe(MARKDOWN_COMMAND_OUTPUT.NO_ISSUES);
      },
    );
  });

  it("preserves exact explicit markdown directory operands through markdown validation excludes", async () => {
    await withLiteralFixtureEnv(
      {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: {
            [VALIDATION_PATH_TOOL_SUBSECTIONS.MARKDOWN]: {
              exclude: [MARKDOWN_VALIDATION_DATA.docsDirectoryName],
            },
          },
        },
      },
      async (env) => {
        const markdownPath = [
          MARKDOWN_VALIDATION_DATA.docsDirectoryName,
          MARKDOWN_VALIDATION_DATA.brokenMarkdownFile,
        ].join("/");
        await env.writeRaw(
          markdownPath,
          MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
        );

        const result = await markdownCommand({
          cwd: env.productDir,
          files: [MARKDOWN_VALIDATION_DATA.docsDirectoryName],
        });

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.FAILURE);
        expect(result.output).toContain(
          MARKDOWN_COMMAND_OUTPUT.ERROR_SUMMARY_SUFFIX,
        );
      },
    );
  });

  it("does not widen explicit markdown directory operands to every markdown include", async () => {
    await withLiteralFixtureEnv(
      {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: {
            [VALIDATION_PATH_TOOL_SUBSECTIONS.MARKDOWN]: {
              include: ["spx/public", "spx/other"],
              exclude: ["spx/public/private"],
            },
          },
        },
      },
      async (env) => {
        await env.writeRaw("spx/public/good.md", "# Good\n");
        await env.writeRaw("spx/public/private/bad.md", "# Bad  \n");
        await env.writeRaw("spx/other/bad.md", "# Bad  \n");

        const result = await markdownCommand({
          cwd: env.productDir,
          files: ["spx/public"],
        });

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect(result.output).toBe(MARKDOWN_COMMAND_OUTPUT.NO_ISSUES);
      },
    );
  });

  it("does not erase explicit markdown child directories below excluded ancestors", async () => {
    const result = await runExplicitMarkdownOperandBypassingExclude(true);

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.FAILURE);
    expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.ERROR_SUMMARY_SUFFIX);
  });

  it("preserves explicit markdown file operands through markdown validation excludes", async () => {
    const result = await runExplicitMarkdownOperandBypassingExclude(false);

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.FAILURE);
    expect(result.output).toContain(MARKDOWN_COMMAND_OUTPUT.ERROR_SUMMARY_SUFFIX);
  });

  it("does not widen explicit markdown directory operands to default markdown roots", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      await env.writeRaw("src/good.md", "# Good\n");
      await env.writeRaw("docs/bad.md", "# Bad  \n");

      const result = await markdownCommand({
        cwd: env.productDir,
        files: ["src"],
      });

      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
      expect(result.output).toBe(MARKDOWN_COMMAND_OUTPUT.NO_ISSUES);
    });
  });

  it("preserves explicit markdown operands through node-status excludes", async () => {
    await withLiteralFixtureEnv({}, async (env) => {
      const excludedNodePath = [
        MARKDOWN_VALIDATION_DATA.spxDirectoryName,
        MARKDOWN_VALIDATION_DATA.declaredNodeDirectory,
      ].join("/");
      const directMarkdownPath = [
        excludedNodePath,
        MARKDOWN_VALIDATION_DATA.declaredMarkdownFile,
      ].join("/");
      const childMarkdownPath = [
        excludedNodePath,
        MARKDOWN_VALIDATION_DATA.declaredChildDirectory,
        MARKDOWN_VALIDATION_DATA.childMarkdownFile,
      ].join("/");
      await env.writeRaw(
        [
          MARKDOWN_VALIDATION_DATA.spxDirectoryName,
          NODE_STATUS_EXCLUDE_FILENAME,
        ].join("/"),
        `${MARKDOWN_VALIDATION_DATA.declaredNodeDirectory}\n`,
      );
      await env.writeRaw(
        directMarkdownPath,
        MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
      );
      await env.writeRaw(
        childMarkdownPath,
        MARKDOWN_VALIDATION_DATA.brokenMarkdownContent,
      );

      const directoryResult = await markdownCommand({
        cwd: env.productDir,
        files: [excludedNodePath],
      });
      const fileResult = await markdownCommand({
        cwd: env.productDir,
        files: [directMarkdownPath],
      });

      expect(directoryResult.exitCode).toBe(VALIDATION_EXIT_CODES.FAILURE);
      expect(directoryResult.output).toContain(
        MARKDOWN_COMMAND_OUTPUT.ERROR_SUMMARY_SUFFIX,
      );
      expect(directoryResult.output).toContain(childMarkdownPath);
      expect(directoryResult.output).not.toContain(directMarkdownPath);
      expect(fileResult.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
      expect(fileResult.output).toBe(MARKDOWN_COMMAND_OUTPUT.NO_ISSUES);
    });
  });
});
