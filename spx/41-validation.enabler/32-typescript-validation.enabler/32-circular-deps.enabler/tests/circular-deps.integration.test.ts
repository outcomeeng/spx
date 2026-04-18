/**
 * Level 2: Integration tests for the TypeScript circular dependency stage via `spx validation circular`.
 *
 * Spec: spx/41-validation.enabler/32-typescript-validation.enabler/32-circular-deps.enabler/circular-deps.md
 *
 * Routing: Glue code (Stage 3C) where behavior IS the interaction with madge
 * via the CLI. Real spawn against real fixture projects (Stage 4 — reliable,
 * safe, cheap, observable). No doubles.
 *
 * Assertions covered:
 *   S1: Clean TypeScript project → madge reports no cycles, exits zero
 *   S2: TypeScript project with circular deps → non-zero exit, cycle reported
 *   S3: TypeScript absent → madge does not execute
 *   C1: ALWAYS gated on detectTypeScript
 *   C2: NEVER invoke madge without tsconfig.json
 */

import { execa } from "execa";
import { describe, expect, it } from "vitest";

import { CLI_PATH } from "@test/harness/constants.js";
import { FIXTURES, HARNESS_TIMEOUT, withValidationEnv } from "@test/harness/with-validation-env.js";

const EXIT_SUCCESS = 0;
const NPX_INSTALL_PROMPT = "Need to install the following packages";
const SKIP_MARKER = "Skipping Circular";
const SUCCESS_MARKER = "Circular dependencies";
const ENOENT_MARKER = "ENOENT";

describe("spx validation circular — language-gated cycle detection", () => {
  it(
    "S1: GIVEN a TypeScript project with no circular deps WHEN running circular THEN madge reports no cycles and exits zero",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
        const result = await execa("node", [CLI_PATH, "validation", "circular"], {
          cwd: path,
          reject: false,
        });

        expect(result.exitCode).toBe(EXIT_SUCCESS);
        expect(result.stdout).toContain(SUCCESS_MARKER);
        expect(result.stdout).not.toContain(NPX_INSTALL_PROMPT);
        expect(result.stdout).not.toContain(SKIP_MARKER);
      });
    },
  );

  it(
    "S2: GIVEN a TypeScript project with a circular dependency WHEN running circular THEN exits non-zero and reports the cycle",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.WITH_CIRCULAR_DEPS }, async ({ path }) => {
        const result = await execa("node", [CLI_PATH, "validation", "circular"], {
          cwd: path,
          reject: false,
        });

        expect(result.exitCode).not.toBe(EXIT_SUCCESS);
        expect(result.stdout).not.toContain(NPX_INSTALL_PROMPT);
      });
    },
  );

  it(
    "S3: GIVEN a project where TypeScript is absent WHEN running circular THEN madge does not execute",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.BARE_PROJECT }, async ({ path }) => {
        const result = await execa("node", [CLI_PATH, "validation", "circular"], {
          cwd: path,
          reject: false,
        });

        expect(result.exitCode).toBe(EXIT_SUCCESS);
        expect(result.stdout).toContain(SKIP_MARKER);
        expect(result.stdout).not.toContain(NPX_INSTALL_PROMPT);
        expect(result.stderr).not.toContain(NPX_INSTALL_PROMPT);
        expect(`${result.stdout}${result.stderr}`).not.toContain(ENOENT_MARKER);
      });
    },
  );

  it(
    "C1: GIVEN a Python-only project WHEN running circular THEN madge is gated off by detectTypeScript",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.PYTHON_PROJECT }, async ({ path }) => {
        const result = await execa("node", [CLI_PATH, "validation", "circular"], {
          cwd: path,
          reject: false,
        });

        expect(result.exitCode).toBe(EXIT_SUCCESS);
        expect(result.stdout).toContain(SKIP_MARKER);
        expect(result.stdout).not.toContain(NPX_INSTALL_PROMPT);
        expect(result.stderr).not.toContain(NPX_INSTALL_PROMPT);
        expect(`${result.stdout}${result.stderr}`).not.toContain(ENOENT_MARKER);
      });
    },
  );

  it(
    "C2: GIVEN .ts files present but no tsconfig.json WHEN running circular THEN madge does not execute and no npx prompt appears",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.TYPESCRIPT_NO_TSCONFIG }, async ({ path }) => {
        const result = await execa("node", [CLI_PATH, "validation", "circular"], {
          cwd: path,
          reject: false,
        });

        expect(result.exitCode).toBe(EXIT_SUCCESS);
        expect(result.stdout).toContain(SKIP_MARKER);
        expect(result.stdout).not.toContain(NPX_INSTALL_PROMPT);
        expect(result.stderr).not.toContain(NPX_INSTALL_PROMPT);
        expect(`${result.stdout}${result.stderr}`).not.toContain(ENOENT_MARKER);
      });
    },
  );
});
