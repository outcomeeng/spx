import type { ChildProcess, SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { chmod, realpath } from "node:fs/promises";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { lintCommand } from "@/commands/validation/lint";
import {
  formatValidationPathsNoTargetsSkipMessage,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_EXIT_CODES,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "@/commands/validation/messages";
import type { ProcessRunner } from "@/lib/process-lifecycle";
import {
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  VALIDATION_PATHS_SUBSECTION,
  validationConfigDescriptor,
} from "@/validation/config/descriptor";
import { TSCONFIG_FILES } from "@/validation/config/scope";
import { ESLINT_PRODUCTION_CONFIG_FILES } from "@/validation/discovery";
import {
  buildEslintArgs,
  DEFAULT_ESLINT_CONFIG_FILE,
  ESLINT_COMMAND_TOKENS,
  ESLINT_LOCAL_BIN_SEGMENTS,
  validateESLint,
} from "@/validation/steps/eslint";
import { VALIDATION_SUBPROCESS_EVENTS, type ValidationWritableStream } from "@/validation/steps/subprocess-output";
import { EXECUTION_MODES, VALIDATION_SCOPES, type ValidationContext } from "@/validation/types";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

class RecordingWritable implements ValidationWritableStream {
  readonly chunks: string[] = [];

  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(Buffer.from(chunk).toString());
    return true;
  }
}

class RecordingEslintChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();

  asChildProcess(): ChildProcess {
    return this as unknown as ChildProcess;
  }
}

class OutputRunner implements ProcessRunner {
  constructor(private readonly stdoutChunk: string) {}

  spawn(_command: string, _args: readonly string[], _options?: SpawnOptions): ChildProcess {
    const child = new RecordingEslintChild();
    queueMicrotask(() => {
      child.stdout.write(this.stdoutChunk);
      child.emit(VALIDATION_SUBPROCESS_EVENTS.CLOSE, VALIDATION_EXIT_CODES.SUCCESS);
    });
    return child.asChildProcess();
  }
}

function createValidationContext(): ValidationContext {
  return {
    projectRoot: process.cwd(),
    scope: VALIDATION_SCOPES.FULL,
    scopeConfig: {
      directories: [],
      excludePatterns: [],
      filePatterns: [],
    },
    mode: EXECUTION_MODES.READ,
    enabledValidations: { ESLINT: true },
    isFileSpecificMode: false,
    eslintConfigFile: DEFAULT_ESLINT_CONFIG_FILE,
  };
}

describe("ESLint command arguments", () => {
  it("passes project lint through without injected policy arguments", () => {
    const args = buildEslintArgs({ scope: VALIDATION_SCOPES.FULL });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CURRENT_DIRECTORY,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
    ]);
  });

  it("passes scoped file lint through without injected policy arguments", () => {
    const validatedFile = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    const args = buildEslintArgs({
      scope: VALIDATION_SCOPES.FULL,
      validatedFiles: [validatedFile],
    });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
      ESLINT_COMMAND_TOKENS.FILE_SEPARATOR,
      validatedFile,
    ]);
  });

  it("lets explicit file scope take precedence over production scope", () => {
    const validatedFile = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    const args = buildEslintArgs({
      scope: VALIDATION_SCOPES.PRODUCTION,
      scopeConfig: {
        directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
        excludePatterns: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
        filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
      },
      validatedFiles: [validatedFile],
    });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
      ESLINT_COMMAND_TOKENS.FILE_SEPARATOR,
      validatedFile,
    ]);
  });

  it("passes fix mode through when explicit file scope is supplied", () => {
    const validatedFile = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    const args = buildEslintArgs({
      scope: VALIDATION_SCOPES.FULL,
      mode: EXECUTION_MODES.WRITE,
      validatedFiles: [validatedFile],
    });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
      ESLINT_COMMAND_TOKENS.FIX_FLAG,
      ESLINT_COMMAND_TOKENS.FILE_SEPARATOR,
      validatedFile,
    ]);
  });

  it("passes fix mode through as the only optional ESLint behavior flag", () => {
    const args = buildEslintArgs({
      scope: VALIDATION_SCOPES.FULL,
      mode: EXECUTION_MODES.WRITE,
    });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CURRENT_DIRECTORY,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
      ESLINT_COMMAND_TOKENS.FIX_FLAG,
    ]);
  });

  it("passes production scope patterns as ESLint targets without process environment state", () => {
    const args = buildEslintArgs({
      scope: VALIDATION_SCOPES.PRODUCTION,
      scopeConfig: {
        directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
        excludePatterns: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
        filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
      },
    });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      VALIDATION_PIPELINE_DATA.productionScopeFilePattern,
      ESLINT_COMMAND_TOKENS.IGNORE_PATTERN_FLAG,
      VALIDATION_PIPELINE_DATA.productionScopeExcludePattern,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
    ]);
  });

  it("uses ESLint current-directory target for implicit TypeScript include scope", () => {
    const args = buildEslintArgs({
      scope: VALIDATION_SCOPES.PRODUCTION,
      scopeConfig: {
        directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
        excludePatterns: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
        filePatterns: [],
      },
    });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CURRENT_DIRECTORY,
      ESLINT_COMMAND_TOKENS.IGNORE_PATTERN_FLAG,
      VALIDATION_PIPELINE_DATA.productionScopeExcludePattern,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
    ]);
  });

  it("runs lint command from the requested project root", async () => {
    await withTestEnv({}, async (env) => {
      await env.writeRaw(
        "tsconfig.json",
        JSON.stringify({ include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern] }),
      );
      await env.writeRaw("eslint.config.ts", "export default [];\n");
      await env.writeRaw("src/index.ts", "export const lintCommandProjectRoot = 1;\n");
      await env.writeRaw(join(...ESLINT_LOCAL_BIN_SEGMENTS), "#!/bin/sh\npwd > eslint-cwd.txt\nexit 0\n");
      await chmod(join(env.productDir, ...ESLINT_LOCAL_BIN_SEGMENTS), 0o755);

      const result = await lintCommand({ cwd: env.productDir, quiet: true });

      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
      expect((await env.readFile("eslint-cwd.txt")).trim()).toBe(await realpath(env.productDir));
    });
  });

  it("passes production ESLint ignore patterns to the spawned binary", async () => {
    await withTestEnv({}, async (env) => {
      await env.writeRaw("tsconfig.json", JSON.stringify({ include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName] }));
      await env.writeRaw(
        TSCONFIG_FILES.production,
        JSON.stringify({
          include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
          exclude: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
        }),
      );
      await env.writeRaw("eslint.config.ts", "export default [];\n");
      await env.writeRaw("src/index.ts", "export const lintCommandProjectRoot = 1;\n");
      await env.writeRaw(
        join(...ESLINT_LOCAL_BIN_SEGMENTS),
        "#!/bin/sh\nprintf '%s\\n' \"$@\" > eslint-args.txt\nexit 0\n",
      );
      await chmod(join(env.productDir, ...ESLINT_LOCAL_BIN_SEGMENTS), 0o755);

      const result = await lintCommand({ cwd: env.productDir, scope: VALIDATION_SCOPES.PRODUCTION, quiet: true });

      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
      expect((await env.readFile("eslint-args.txt")).trim().split("\n")).toStrictEqual([
        VALIDATION_PIPELINE_DATA.productionScopeFilePattern,
        ESLINT_COMMAND_TOKENS.IGNORE_PATTERN_FLAG,
        VALIDATION_PIPELINE_DATA.productionScopeExcludePattern,
        ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
        DEFAULT_ESLINT_CONFIG_FILE,
      ]);
    });
  });

  it("uses the production ESLint config when production scope supplies one", async () => {
    await withTestEnv({}, async (env) => {
      const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
      await env.writeRaw(
        TSCONFIG_FILES.full,
        JSON.stringify({ include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName] }),
      );
      await env.writeRaw(
        TSCONFIG_FILES.production,
        JSON.stringify({
          include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
        }),
      );
      await env.writeRaw(DEFAULT_ESLINT_CONFIG_FILE, "export default [];\n");
      await env.writeRaw(ESLINT_PRODUCTION_CONFIG_FILES[0], "export default [];\n");
      await env.writeRaw(sourceFilePath, "export const lintCommandProjectRoot = 1;\n");
      await env.writeRaw(
        join(...ESLINT_LOCAL_BIN_SEGMENTS),
        "#!/bin/sh\nprintf '%s\\n' \"$@\" > eslint-args.txt\nexit 0\n",
      );
      await chmod(join(env.productDir, ...ESLINT_LOCAL_BIN_SEGMENTS), 0o755);

      const result = await lintCommand({ cwd: env.productDir, scope: VALIDATION_SCOPES.PRODUCTION, quiet: true });

      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
      expect((await env.readFile("eslint-args.txt")).trim().split("\n")).toContain(
        ESLINT_PRODUCTION_CONFIG_FILES[0],
      );
    });
  });

  it("uses a production-only ESLint config for production scope", async () => {
    await withTestEnv({}, async (env) => {
      const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
      await env.writeRaw(
        TSCONFIG_FILES.full,
        JSON.stringify({ include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName] }),
      );
      await env.writeRaw(
        TSCONFIG_FILES.production,
        JSON.stringify({
          include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
        }),
      );
      await env.writeRaw(ESLINT_PRODUCTION_CONFIG_FILES[0], "export default [];\n");
      await env.writeRaw(sourceFilePath, "export const lintCommandProjectRoot = 1;\n");
      await env.writeRaw(
        join(...ESLINT_LOCAL_BIN_SEGMENTS),
        "#!/bin/sh\nprintf '%s\\n' \"$@\" > eslint-args.txt\nexit 0\n",
      );
      await chmod(join(env.productDir, ...ESLINT_LOCAL_BIN_SEGMENTS), 0o755);

      const result = await lintCommand({ cwd: env.productDir, scope: VALIDATION_SCOPES.PRODUCTION, quiet: true });

      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
      expect((await env.readFile("eslint-args.txt")).trim().split("\n")).toContain(
        ESLINT_PRODUCTION_CONFIG_FILES[0],
      );
    });
  });

  it("passes ESLint-specific validation paths to the spawned binary", async () => {
    await withTestEnv(
      {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: {
            [VALIDATION_PATH_TOOL_SUBSECTIONS.ESLINT]: {
              include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
              exclude: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
            },
          },
        },
      },
      async (env) => {
        const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
        const testFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.testFilePath());
        await env.writeRaw(
          TSCONFIG_FILES.full,
          JSON.stringify({
            include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern, testFilePath],
          }),
        );
        await env.writeRaw(DEFAULT_ESLINT_CONFIG_FILE, "export default [];\n");
        await env.writeRaw(sourceFilePath, "export const lintCommandProjectRoot = 1;\n");
        await env.writeRaw(testFilePath, "expect(true).toBe(true);\n");
        await env.writeRaw(
          join(...ESLINT_LOCAL_BIN_SEGMENTS),
          "#!/bin/sh\nprintf '%s\\n' \"$@\" > eslint-args.txt\nexit 0\n",
        );
        await chmod(join(env.productDir, ...ESLINT_LOCAL_BIN_SEGMENTS), 0o755);

        const result = await lintCommand({ cwd: env.productDir, quiet: true });

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect((await env.readFile("eslint-args.txt")).trim().split("\n")).toStrictEqual([
          VALIDATION_PIPELINE_DATA.productionScopeFilePattern,
          ESLINT_COMMAND_TOKENS.IGNORE_PATTERN_FLAG,
          VALIDATION_PIPELINE_DATA.productionScopeExcludePattern,
          ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
          DEFAULT_ESLINT_CONFIG_FILE,
        ]);
      },
    );
  });

  it("skips ESLint when validation path includes have no intersection", async () => {
    const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    const testFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.testFilePath());
    await withTestEnv(
      {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: {
            include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
            [VALIDATION_PATH_TOOL_SUBSECTIONS.ESLINT]: {
              include: [testFilePath],
            },
          },
        },
      },
      async (env) => {
        await env.writeRaw(
          TSCONFIG_FILES.full,
          JSON.stringify({
            include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern, testFilePath],
          }),
        );
        await env.writeRaw(DEFAULT_ESLINT_CONFIG_FILE, "export default [];\n");
        await env.writeRaw(sourceFilePath, "export const lintCommandProjectRoot = 1;\n");
        await env.writeRaw(testFilePath, "expect(true).toBe(true);\n");
        await env.writeRaw(
          join(...ESLINT_LOCAL_BIN_SEGMENTS),
          "#!/bin/sh\nprintf '%s\\n' \"$@\" > eslint-args.txt\nexit 0\n",
        );
        await chmod(join(env.productDir, ...ESLINT_LOCAL_BIN_SEGMENTS), 0o755);

        const result = await lintCommand({ cwd: env.productDir });

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect(result.output).toBe(formatValidationPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.ESLINT));
        expect(existsSync(join(env.productDir, "eslint-args.txt"))).toBe(false);
      },
    );
  });

  it("preserves explicit ESLint file scope through validation paths", async () => {
    const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    const testFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.testFilePath());
    await withTestEnv(
      {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: {
            include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
          },
        },
      },
      async (env) => {
        await env.writeRaw(
          TSCONFIG_FILES.full,
          JSON.stringify({
            include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern, testFilePath],
          }),
        );
        await env.writeRaw(DEFAULT_ESLINT_CONFIG_FILE, "export default [];\n");
        await env.writeRaw(sourceFilePath, "export const lintCommandProjectRoot = 1;\n");
        await env.writeRaw(testFilePath, "expect(true).toBe(true);\n");
        await env.writeRaw(
          join(...ESLINT_LOCAL_BIN_SEGMENTS),
          "#!/bin/sh\nprintf '%s\\n' \"$@\" > eslint-args.txt\nexit 0\n",
        );
        await chmod(join(env.productDir, ...ESLINT_LOCAL_BIN_SEGMENTS), 0o755);

        const result = await lintCommand({ cwd: env.productDir, files: [testFilePath] });

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect((await env.readFile("eslint-args.txt")).trim().split("\n")).toStrictEqual([
          ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
          DEFAULT_ESLINT_CONFIG_FILE,
          ESLINT_COMMAND_TOKENS.FILE_SEPARATOR,
          testFilePath,
        ]);
      },
    );
  });

  it("preserves explicit ESLint root directory operands through validation paths", async () => {
    await withTestEnv(
      {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: {
            include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
            exclude: [
              `${VALIDATION_PIPELINE_DATA.sourceDirectoryName}/${VALIDATION_PIPELINE_DATA.excludedSourceDirectoryName}`,
            ],
          },
        },
      },
      async (env) => {
        await env.writeRaw(
          TSCONFIG_FILES.full,
          JSON.stringify({ include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern] }),
        );
        await env.writeRaw(DEFAULT_ESLINT_CONFIG_FILE, "export default [];\n");
        await env.writeRaw(
          join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
          "export const lintCommandProjectRoot = 1;\n",
        );
        await env.writeRaw(
          join(...ESLINT_LOCAL_BIN_SEGMENTS),
          "#!/bin/sh\nprintf '%s\\n' \"$@\" > eslint-args.txt\nexit 0\n",
        );
        await chmod(join(env.productDir, ...ESLINT_LOCAL_BIN_SEGMENTS), 0o755);

        const result = await lintCommand({ cwd: env.productDir, files: ["."], quiet: true });

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect((await env.readFile("eslint-args.txt")).trim().split("\n")).toStrictEqual([
          VALIDATION_PIPELINE_DATA.productionScopeFilePattern,
          ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
          DEFAULT_ESLINT_CONFIG_FILE,
        ]);
      },
    );
  });

  it("does not widen explicit ESLint directory operands to every validation include", async () => {
    await withTestEnv(
      {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: {
            include: [
              VALIDATION_PIPELINE_DATA.sourceDirectoryName,
              VALIDATION_PIPELINE_DATA.secondarySourceDirectoryName,
            ],
            exclude: [
              `${VALIDATION_PIPELINE_DATA.sourceDirectoryName}/${VALIDATION_PIPELINE_DATA.excludedSourceDirectoryName}`,
            ],
          },
        },
      },
      async (env) => {
        await env.writeRaw(
          TSCONFIG_FILES.full,
          JSON.stringify({
            include: [
              VALIDATION_PIPELINE_DATA.productionScopeFilePattern,
              `${VALIDATION_PIPELINE_DATA.secondarySourceDirectoryName}/**/*.ts`,
            ],
          }),
        );
        await env.writeRaw(DEFAULT_ESLINT_CONFIG_FILE, "export default [];\n");
        await env.writeRaw(
          join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
          "export const lintCommandProjectRoot = 1;\n",
        );
        await env.writeRaw(
          join(
            VALIDATION_PIPELINE_DATA.secondarySourceDirectoryName,
            VALIDATION_PIPELINE_DATA.secondarySourceFileName,
          ),
          "export const widenedLintTarget = 1;\n",
        );
        await env.writeRaw(
          join(...ESLINT_LOCAL_BIN_SEGMENTS),
          "#!/bin/sh\nprintf '%s\\n' \"$@\" > eslint-args.txt\nexit 0\n",
        );
        await chmod(join(env.productDir, ...ESLINT_LOCAL_BIN_SEGMENTS), 0o755);

        const result = await lintCommand({
          cwd: env.productDir,
          files: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
          quiet: true,
        });

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect((await env.readFile("eslint-args.txt")).trim().split("\n")).toStrictEqual([
          VALIDATION_PIPELINE_DATA.productionScopeFilePattern,
          ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
          DEFAULT_ESLINT_CONFIG_FILE,
        ]);
      },
    );
  });

  it("normalizes absolute ESLint file scope before validation path filtering", async () => {
    const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    await withTestEnv(
      {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: {
            include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
          },
        },
      },
      async (env) => {
        await env.writeRaw(
          TSCONFIG_FILES.full,
          JSON.stringify({ include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern] }),
        );
        await env.writeRaw(DEFAULT_ESLINT_CONFIG_FILE, "export default [];\n");
        await env.writeRaw(sourceFilePath, "export const lintCommandProjectRoot = 1;\n");
        await env.writeRaw(
          join(...ESLINT_LOCAL_BIN_SEGMENTS),
          "#!/bin/sh\nprintf '%s\\n' \"$@\" > eslint-args.txt\nexit 0\n",
        );
        await chmod(join(env.productDir, ...ESLINT_LOCAL_BIN_SEGMENTS), 0o755);

        const result = await lintCommand({ cwd: env.productDir, files: [join(env.productDir, sourceFilePath)] });

        expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
        expect((await env.readFile("eslint-args.txt")).trim().split("\n")).toStrictEqual([
          ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
          DEFAULT_ESLINT_CONFIG_FILE,
          ESLINT_COMMAND_TOKENS.FILE_SEPARATOR,
          sourceFilePath,
        ]);
      },
    );
  });

  it("forwards ESLint subprocess output through injected parent streams", async () => {
    const stdoutChunk = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const stdout = new RecordingWritable();
    const stderr = new RecordingWritable();

    const result = await validateESLint(
      createValidationContext(),
      new OutputRunner(stdoutChunk),
      { stdout, stderr },
    );

    expect(result.success).toBe(true);
    expect(stdout.chunks).toEqual([stdoutChunk]);
    expect(stderr.chunks).toEqual([]);
  });
});

describe("ESLint command preflight gates", () => {
  it("returns at TypeScript detection before any ESLint collaborator", async () => {
    let detectionCalls = 0;
    let downstreamCalls = 0;
    const result = await lintCommand(
      { cwd: process.cwd(), quiet: true },
      {
        detectTypeScript: () => {
          detectionCalls += 1;
          return { present: false };
        },
        discoverTool: () => {
          downstreamCalls += 1;
          throw new Error(VALIDATION_COMMAND_OUTPUT.ESLINT_FAILURE);
        },
        resolveConfig: () => {
          downstreamCalls += 1;
          throw new Error(VALIDATION_COMMAND_OUTPUT.ESLINT_FAILURE);
        },
        validateESLint: () => {
          downstreamCalls += 1;
          throw new Error(VALIDATION_COMMAND_OUTPUT.ESLINT_FAILURE);
        },
      },
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(detectionCalls).toBe(1);
    expect(downstreamCalls).toBe(0);
  });

  it("rejects a missing flat config before discovery or process execution", async () => {
    let detectionCalls = 0;
    let downstreamCalls = 0;
    const result = await lintCommand(
      { cwd: process.cwd() },
      {
        detectTypeScript: () => {
          detectionCalls += 1;
          return { present: true };
        },
        discoverTool: () => {
          downstreamCalls += 1;
          throw new Error(VALIDATION_COMMAND_OUTPUT.ESLINT_FAILURE);
        },
        resolveConfig: () => {
          downstreamCalls += 1;
          throw new Error(VALIDATION_COMMAND_OUTPUT.ESLINT_FAILURE);
        },
        validateESLint: () => {
          downstreamCalls += 1;
          throw new Error(VALIDATION_COMMAND_OUTPUT.ESLINT_FAILURE);
        },
      },
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.FAILURE);
    expect(result.output).toBe(VALIDATION_COMMAND_OUTPUT.ESLINT_MISSING_CONFIG);
    expect(detectionCalls).toBe(1);
    expect(downstreamCalls).toBe(0);
  });
});
