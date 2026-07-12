import { EventEmitter } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { execa } from "execa";
import * as fc from "fast-check";
import { expect, it } from "vitest";

import { VALIDATION_RUNTIME_ANTI_MARKERS } from "@/commands/validation/runtime-diagnostics";
import {
  TYPESCRIPT_TOOL_DISCOVERY,
  TYPESCRIPT_VALIDATION_MESSAGES,
  typescriptCommand,
  type TypeScriptCommandDeps,
} from "@/commands/validation/typescript";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { EPIPE_CODE, EPIPE_EXIT_CODE, UNCAUGHT_EVENT_NAME } from "@/lib/process-lifecycle";
import { TSCONFIG_FILES } from "@/validation/config/scope";
import { TOOL_DISCOVERY } from "@/validation/discovery/constants";
import { TOOL_DISCOVERY_PRIORITY } from "@/validation/discovery/tool-finder";
import {
  forwardValidationSubprocessOutput,
  VALIDATION_SUBPROCESS_EVENTS,
  type ValidationWritableStream,
} from "@/validation/steps/subprocess-output";
import { validateTypeScript } from "@/validation/steps/typescript";
import { VALIDATION_SCOPES } from "@/validation/types";
import {
  arbitraryDomainLiteral,
  LITERAL_TEST_GENERATOR,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { CLI_PATH } from "@testing/harnesses/constants";
import { runSpawnFixture } from "@testing/harnesses/process-lifecycle/spawn-fixture";
import {
  RecordingValidationChild,
  RejectingUnexpectedValidationSpawnRunner,
} from "@testing/harnesses/validation/subprocess";
import { HARNESS_TIMEOUT, PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

const EXPECTED_PIPED_STDIO = "pipe";

class RecordingWritable implements ValidationWritableStream {
  readonly chunks: string[] = [];

  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(Buffer.from(chunk).toString());
    return true;
  }
}

class BackpressuredWritable extends EventEmitter implements ValidationWritableStream {
  readonly chunks: string[] = [];

  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(Buffer.from(chunk).toString());
    return false;
  }
}

export function registerTypeCheckScenarioTests(): void {
  it(
    "S1: GIVEN a TypeScript product with valid types WHEN running typescript THEN tsc exits zero",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
        const result = await runTypeScriptValidation(path);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(TYPESCRIPT_VALIDATION_MESSAGES.TOOL_LABEL);
        expect(result.stdout).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
        expect(result.stdout).not.toContain(TYPESCRIPT_VALIDATION_MESSAGES.ABSENT);
      });
    },
  );

  it(
    "S2: GIVEN a project where TypeScript is absent WHEN running typescript THEN tsc does not execute and no npx prompt appears",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.BARE_PROJECT }, async ({ path }) => {
        expectTypeScriptAbsent(await runTypeScriptValidation(path));
      });
    },
  );

  it(
    "S3: GIVEN a TypeScript product with type errors WHEN running typescript THEN exits non-zero and reports errors",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.WITH_TYPE_ERRORS }, async ({ path }) => {
        const result = await runTypeScriptValidation(path);

        expect(result.exitCode).not.toBe(0);
        expect(result.stdout).not.toMatch(/error TS\d+:/u);
        expect(result.stderr).toMatch(/error TS\d+:/u);
        expect(result.stdout).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
      });
    },
  );

  it(
    "S3: GIVEN a directory operand and default TypeScript includes WHEN the directory has type errors THEN exits non-zero",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
        const apiDirectory = join(
          VALIDATION_PIPELINE_DATA.sourceDirectoryName,
          VALIDATION_PIPELINE_DATA.narrowSourceDirectoryName,
        );
        await mkdir(join(path, apiDirectory), { recursive: true });
        await writeFile(
          join(path, apiDirectory, VALIDATION_PIPELINE_DATA.cleanSourceFileName),
          VALIDATION_PIPELINE_DATA.secondaryTypeErrorSourceContent,
        );
        const tsconfigWithDefaultIncludes = JSON.parse(
          await readFile(join(path, TSCONFIG_FILES.full), VALIDATION_PIPELINE_DATA.fixtureTextEncoding),
        ) as { include?: unknown };
        delete tsconfigWithDefaultIncludes.include;
        await writeFile(join(path, TSCONFIG_FILES.full), JSON.stringify(tsconfigWithDefaultIncludes));

        const result = await runTypeScriptValidation(path, [apiDirectory]);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain(TYPESCRIPT_VALIDATION_MESSAGES.TOOL_LABEL);
        expect(result.stdout).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
      });
    },
  );

  it(
    "C1: GIVEN a Python-only project WHEN running typescript THEN tsc is gated off by detectTypeScript",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.PYTHON_PROJECT }, async ({ path }) => {
        expectTypeScriptAbsent(await runTypeScriptValidation(path));
      });
    },
  );

  it(
    "C2: GIVEN .ts files present but no tsconfig.json WHEN running typescript THEN tsc does not execute and no npx prompt appears",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.TYPESCRIPT_NO_TSCONFIG }, async ({ path }) => {
        expectTypeScriptAbsent(await runTypeScriptValidation(path));
      });
    },
  );
}

export function registerTypeCheckComplianceTests(): void {
  it("terminates through the lifecycle handler when the TypeScript output consumer closes", async () => {
    await withValidationEnv({ fixture: PROJECT_FIXTURES.WITH_TYPE_ERRORS }, async ({ path }) => {
      const result = await runSpawnFixture({
        command: process.execPath,
        args: validationAllArgs(),
        cwd: path,
        destroyStdoutAfterMs: 0,
      });

      expect(result.exitCode).toBe(EPIPE_EXIT_CODE);
      expect(result.stderr).not.toContain(UNCAUGHT_EVENT_NAME);
      expect(result.stderr).not.toContain(EPIPE_CODE);
    });
  });

  it("spawns tsc with piped stdio so lifecycle handlers can observe parent output closure", async () => {
    const toolPath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    const runner = new RejectingUnexpectedValidationSpawnRunner({
      command: toolPath,
      stdio: EXPECTED_PIPED_STDIO,
    });
    const result = await validateTypeScript(
      { scope: VALIDATION_SCOPES.FULL, productDir: process.cwd() },
      { runner, toolPath },
    );

    expect(result.success).toBe(true);
    expect(runner.commands).toEqual([toolPath]);
    expect(runner.spawnOptions?.stdio).toEqual(EXPECTED_PIPED_STDIO);
  });

  it("spawns the product-first executable returned by TypeScript command discovery", async () => {
    await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
      const toolPath = join(path, sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath()));
      const runner = new RejectingUnexpectedValidationSpawnRunner({
        command: toolPath,
        stdio: EXPECTED_PIPED_STDIO,
      });
      const discoveryOptions: Parameters<TypeScriptCommandDeps["discoverTool"]>[1][] = [];
      const deps: TypeScriptCommandDeps = {
        discoverTool: async (tool, options) => {
          discoveryOptions.push(options);
          return {
            found: true,
            location: { tool, path: toolPath, source: TOOL_DISCOVERY.SOURCES.GLOBAL },
          };
        },
        validateTypeScript: (context, options) => validateTypeScript(context, { ...options, runner }),
      };

      const result = await typescriptCommand({ cwd: path, quiet: true }, deps);

      expect(result.exitCode).toBe(0);
      expect(runner.commands).toEqual([toolPath]);
      expect(discoveryOptions).toEqual([expect.objectContaining({
        productDir: path,
        executableName: TYPESCRIPT_TOOL_DISCOVERY.EXECUTABLE_NAME,
        bundledExecutable: TYPESCRIPT_TOOL_DISCOVERY.BUNDLED_EXECUTABLE,
        priority: TOOL_DISCOVERY_PRIORITY.PRODUCT_FIRST,
      })]);
    });
  });

  it("forwards child stdout and stderr chunks through injected parent streams", () => {
    fc.assert(
      fc.property(arbitraryDomainLiteral(), arbitraryDomainLiteral(), (stdoutChunk, stderrChunk) => {
        const child = new RecordingValidationChild();
        const stdout = new RecordingWritable();
        const stderr = new RecordingWritable();

        forwardValidationSubprocessOutput(child, { stdout, stderr });
        child.stdout.write(stdoutChunk);
        child.stderr.write(stderrChunk);

        expect(stdout.chunks).toEqual([stdoutChunk]);
        expect(stderr.chunks).toEqual([stderrChunk]);
      }),
    );
  });

  it("pauses child output until the parent stream drains", () => {
    fc.assert(
      fc.property(arbitraryDomainLiteral(), (stdoutChunk) => {
        const child = new RecordingValidationChild();
        const stdout = new BackpressuredWritable();
        const stderr = new RecordingWritable();

        forwardValidationSubprocessOutput(child, { stdout, stderr });
        child.stdout.write(stdoutChunk);
        expect(child.stdout.isPaused()).toBe(true);

        stdout.emit(VALIDATION_SUBPROCESS_EVENTS.DRAIN);
        expect(child.stdout.isPaused()).toBe(false);
        expect(stdout.chunks).toEqual([stdoutChunk]);
      }),
    );
  });
}

function validationTypeScriptAliasArgs(): string[] {
  const alias = validationCliDefinition.subcommands.typescript.alias;
  if (alias === undefined) throw new Error("TypeScript validation alias is not registered");
  return [CLI_PATH, validationCliDefinition.domain.commandName, alias];
}

function validationAllArgs(): string[] {
  return [CLI_PATH, validationCliDefinition.domain.commandName, validationCliDefinition.subcommands.all.commandName];
}

async function runTypeScriptValidation(
  cwd: string,
  operands: readonly string[] = [],
): Promise<Awaited<ReturnType<typeof execa>>> {
  return execa(process.execPath, [...validationTypeScriptAliasArgs(), ...operands], { cwd, reject: false });
}

function expectTypeScriptAbsent(result: Awaited<ReturnType<typeof execa>>): void {
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(TYPESCRIPT_VALIDATION_MESSAGES.ABSENT);
  expect(result.stdout).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
  expect(result.stderr).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
  expect(`${result.stdout}${result.stderr}`).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.ENOENT);
}
