/**
 * Level 2: Integration tests for the TypeScript type-check stage via `spx validation ts`.
 *
 * Spec: spx/41-validation.enabler/32-typescript-validation.enabler/32-type-check.enabler/type-check.md
 *
 * Routing: Glue code (Stage 3C) where behavior IS the interaction with tsc
 * via the CLI. Real spawn against real fixture projects (Stage 4 — reliable,
 * safe, cheap, observable). No doubles.
 *
 * Assertions covered:
 *   S1: Clean TypeScript project → tsc exits zero
 *   S2: TypeScript absent → tsc does not execute, no npx install prompt
 *   S3: TypeScript project with type errors → non-zero exit, errors reported
 *   C1: ALWAYS gated on detectTypeScript
 *   C2: NEVER invoke tsc without tsconfig.json
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { execa } from "execa";
import { describe, expect, it } from "vitest";

import { VALIDATION_RUNTIME_ANTI_MARKERS } from "@/commands/validation/runtime-diagnostics";
import {
  TYPESCRIPT_TOOL_DISCOVERY,
  TYPESCRIPT_VALIDATION_MESSAGES,
  typescriptCommand,
  type TypeScriptCommandDeps,
} from "@/commands/validation/typescript";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { TSCONFIG_FILES } from "@/validation/config/scope";
import { detectTypeScript, discoverTool } from "@/validation/discovery";
import { validateTypeScript } from "@/validation/steps/typescript";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { CLI_PATH } from "@testing/harnesses/constants";
import { RecordingSpawnOptionsRunner } from "@testing/harnesses/validation/subprocess";
import {
  HARNESS_TIMEOUT,
  PROJECT_FIXTURES,
  VALIDATION_FIXTURE_TEXT_ENCODING,
  withValidationEnv,
} from "@testing/harnesses/with-validation-env";

function validationTypeScriptCommandArgs(): string[] {
  return [
    CLI_PATH,
    validationCliDefinition.domain.commandName,
    validationCliDefinition.subcommands.typescript.commandName,
  ];
}

async function expectTypeScriptCommandGated(productDir: string): Promise<void> {
  const deps: TypeScriptCommandDeps = {
    detectTypeScript,
    discoverTool: async () => {
      throw new Error("TypeScript discovery ran without a tsconfig");
    },
    validateTypeScript: async () => {
      throw new Error("TypeScript validation ran without a tsconfig");
    },
  };
  const result = await typescriptCommand({ cwd: productDir }, deps);
  expect(result.exitCode).toBe(0);
}

export function registerTypeCheckScenarios(): void {
  describe("spx validation typescript — language-gated type checking", () => {
    it(
      "S1: GIVEN a TypeScript project with valid types WHEN running typescript THEN tsc exits zero",
      { timeout: HARNESS_TIMEOUT },
      async () => {
        await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
          const result = await execa(process.execPath, validationTypeScriptCommandArgs(), {
            cwd: path,
            reject: false,
          });

          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain(TYPESCRIPT_VALIDATION_MESSAGES.TOOL_LABEL);
          expect(result.stdout).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
          expect(result.stdout).not.toContain(TYPESCRIPT_VALIDATION_MESSAGES.ABSENT);

          const runner = new RecordingSpawnOptionsRunner();
          const commandResult = await typescriptCommand(
            { cwd: path, quiet: true },
            {
              detectTypeScript,
              discoverTool,
              validateTypeScript: (context, options) => validateTypeScript(context, { ...options, runner }),
            },
          );
          expect(commandResult.exitCode).toBe(0);
          expect(runner.commands).toEqual([
            join(path, ...TYPESCRIPT_TOOL_DISCOVERY.PRODUCT_EXECUTABLE_SEGMENTS),
          ]);
        });
      },
    );

    it(
      "S2: GIVEN a project where TypeScript is absent WHEN running typescript THEN tsc does not execute and no npx prompt appears",
      { timeout: HARNESS_TIMEOUT },
      async () => {
        await withValidationEnv({ fixture: PROJECT_FIXTURES.BARE_PROJECT }, async ({ path }) => {
          const result = await execa(process.execPath, validationTypeScriptCommandArgs(), {
            cwd: path,
            reject: false,
          });

          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain(TYPESCRIPT_VALIDATION_MESSAGES.ABSENT);
          expect(result.stdout).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
          expect(result.stderr).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
          expect(`${result.stdout}${result.stderr}`).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.ENOENT);
          await expectTypeScriptCommandGated(path);
        });
      },
    );

    it(
      "S3: GIVEN a TypeScript project with type errors WHEN running typescript THEN exits non-zero and reports errors",
      { timeout: HARNESS_TIMEOUT },
      async () => {
        await withValidationEnv({ fixture: PROJECT_FIXTURES.WITH_TYPE_ERRORS }, async ({ path }) => {
          const result = await execa(process.execPath, validationTypeScriptCommandArgs(), {
            cwd: path,
            reject: false,
          });

          expect(result.exitCode).not.toBe(0);
          expect(result.stderr).toContain(TYPESCRIPT_VALIDATION_MESSAGES.TOOL_LABEL);
          expect(result.stderr).toContain(VALIDATION_PIPELINE_DATA.typeErrorSourceSegments.join("/"));
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
            await readFile(join(path, TSCONFIG_FILES.full), VALIDATION_FIXTURE_TEXT_ENCODING),
          ) as { include?: unknown };
          delete tsconfigWithDefaultIncludes.include;
          await writeFile(
            join(path, TSCONFIG_FILES.full),
            JSON.stringify(tsconfigWithDefaultIncludes),
          );

          const result = await execa(process.execPath, [...validationTypeScriptCommandArgs(), apiDirectory], {
            cwd: path,
            reject: false,
          });

          expect(result.exitCode).not.toBe(0);
          expect(result.stderr).toContain(TYPESCRIPT_VALIDATION_MESSAGES.TOOL_LABEL);
          expect(result.stderr).toContain(
            `${apiDirectory}/${VALIDATION_PIPELINE_DATA.cleanSourceFileName}`,
          );
          expect(result.stdout).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
        });
      },
    );

    it(
      "C1: GIVEN a Python-only project WHEN running typescript THEN tsc is gated off by detectTypeScript",
      { timeout: HARNESS_TIMEOUT },
      async () => {
        await withValidationEnv({ fixture: PROJECT_FIXTURES.PYTHON_PROJECT }, async ({ path }) => {
          const result = await execa(process.execPath, validationTypeScriptCommandArgs(), {
            cwd: path,
            reject: false,
          });

          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain(TYPESCRIPT_VALIDATION_MESSAGES.ABSENT);
          expect(result.stdout).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
          expect(result.stderr).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
          expect(`${result.stdout}${result.stderr}`).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.ENOENT);
          await expectTypeScriptCommandGated(path);
        });
      },
    );

    it(
      "C2: GIVEN .ts files present but no tsconfig.json WHEN running typescript THEN tsc does not execute and no npx prompt appears",
      { timeout: HARNESS_TIMEOUT },
      async () => {
        await withValidationEnv({ fixture: PROJECT_FIXTURES.TYPESCRIPT_NO_TSCONFIG }, async ({ path }) => {
          const result = await execa(process.execPath, validationTypeScriptCommandArgs(), {
            cwd: path,
            reject: false,
          });

          // detectTypeScript checks for tsconfig.json, not .ts files.
          // Without tsconfig.json, tsc must not be invoked — exit 0 with skip.
          expect(result.exitCode).toBe(0);
          expect(result.stdout).toContain(TYPESCRIPT_VALIDATION_MESSAGES.ABSENT);
          expect(result.stdout).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
          expect(result.stderr).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
          expect(`${result.stdout}${result.stderr}`).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.ENOENT);
        });
      },
    );
  });
}
