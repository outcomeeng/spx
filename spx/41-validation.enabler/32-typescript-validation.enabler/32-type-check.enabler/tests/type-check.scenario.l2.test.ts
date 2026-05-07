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

import { execa } from "execa";
import { describe, expect, it } from "vitest";

import { VALIDATION_RUNTIME_ANTI_MARKERS } from "@/commands/validation/runtime-diagnostics";
import { TYPESCRIPT_VALIDATION_MESSAGES } from "@/commands/validation/typescript";
import { validationCliDefinition } from "@/domains/validation";
import { CLI_PATH } from "@testing/harnesses/constants";
import { HARNESS_TIMEOUT, PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

function validationTypeScriptAliasArgs(): string[] {
  const alias = validationCliDefinition.subcommands.typescript.alias;
  if (alias === undefined) {
    throw new Error("TypeScript validation alias is not registered");
  }

  return [CLI_PATH, validationCliDefinition.domain.commandName, alias];
}

describe("spx validation typescript — language-gated type checking", () => {
  it(
    "S1: GIVEN a TypeScript project with valid types WHEN running typescript THEN tsc exits zero",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
        const result = await execa(process.execPath, validationTypeScriptAliasArgs(), {
          cwd: path,
          reject: false,
        });

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
        const result = await execa(process.execPath, validationTypeScriptAliasArgs(), {
          cwd: path,
          reject: false,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(TYPESCRIPT_VALIDATION_MESSAGES.ABSENT);
        expect(result.stdout).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
        expect(result.stderr).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
        expect(`${result.stdout}${result.stderr}`).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.ENOENT);
      });
    },
  );

  it(
    "S3: GIVEN a TypeScript project with type errors WHEN running typescript THEN exits non-zero and reports errors",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.WITH_TYPE_ERRORS }, async ({ path }) => {
        const result = await execa(process.execPath, validationTypeScriptAliasArgs(), {
          cwd: path,
          reject: false,
        });

        expect(result.exitCode).not.toBe(0);
        expect(result.stdout).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
      });
    },
  );

  it(
    "C1: GIVEN a Python-only project WHEN running typescript THEN tsc is gated off by detectTypeScript",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.PYTHON_PROJECT }, async ({ path }) => {
        const result = await execa(process.execPath, validationTypeScriptAliasArgs(), {
          cwd: path,
          reject: false,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(TYPESCRIPT_VALIDATION_MESSAGES.ABSENT);
        expect(result.stdout).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
        expect(result.stderr).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
        expect(`${result.stdout}${result.stderr}`).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.ENOENT);
      });
    },
  );

  it(
    "C2: GIVEN .ts files present but no tsconfig.json WHEN running typescript THEN tsc does not execute and no npx prompt appears",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.TYPESCRIPT_NO_TSCONFIG }, async ({ path }) => {
        const result = await execa(process.execPath, validationTypeScriptAliasArgs(), {
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
