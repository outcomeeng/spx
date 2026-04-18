/**
 * Level 2: Integration tests for the TypeScript lint stage via `spx validation lint`.
 *
 * Spec: spx/41-validation.enabler/32-typescript-validation.enabler/32-lint.enabler/lint.md
 *
 * Routing: Glue code (Stage 3C) where behavior IS the interaction with the CLI
 * and filesystem. Real spawn against real fixture projects (Stage 4 — reliable,
 * safe, cheap, observable). No doubles.
 */

import { execa } from "execa";
import { describe, expect, it } from "vitest";

import { CLI_PATH } from "@test/harness/constants.js";
import { FIXTURES, HARNESS_TIMEOUT, withValidationEnv } from "@test/harness/with-validation-env.js";

const EXIT_SUCCESS = 0;
const NPX_INSTALL_PROMPT = "Need to install the following packages";
const SKIP_PREFIX = "Skipping";
const MISSING_CONFIG_MARKER = "ESLint config";
const ESLINT_OUTPUT_MARKER = "ESLint";
const ENOENT_MARKER = "ENOENT";

describe("spx validation lint — language-gated execution", () => {
  it(
    "GIVEN a TypeScript fixture with eslint.config.ts WHEN running lint THEN ESLint executes",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
        const result = await execa("node", [CLI_PATH, "validation", "lint"], {
          cwd: path,
          reject: false,
        });

        expect(result.exitCode).toBe(EXIT_SUCCESS);
        expect(result.stdout).toContain(ESLINT_OUTPUT_MARKER);
        expect(result.stdout).not.toContain(NPX_INSTALL_PROMPT);
        expect(result.stdout).not.toContain(SKIP_PREFIX);
      });
    },
  );

  it(
    "GIVEN a Python fixture WHEN running lint THEN ESLint does not execute and no install prompt appears",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.PYTHON_PROJECT }, async ({ path }) => {
        const result = await execa("node", [CLI_PATH, "validation", "lint"], {
          cwd: path,
          reject: false,
        });

        expect(result.exitCode).toBe(EXIT_SUCCESS);
        expect(result.stdout).not.toContain(NPX_INSTALL_PROMPT);
        expect(result.stderr).not.toContain(NPX_INSTALL_PROMPT);
        expect(`${result.stdout}${result.stderr}`).not.toContain(ENOENT_MARKER);
      });
    },
  );

  it(
    "GIVEN a bare fixture with no language markers WHEN running lint THEN ESLint does not execute",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.BARE_PROJECT }, async ({ path }) => {
        const result = await execa("node", [CLI_PATH, "validation", "lint"], {
          cwd: path,
          reject: false,
        });

        expect(result.exitCode).toBe(EXIT_SUCCESS);
        expect(result.stdout).not.toContain(NPX_INSTALL_PROMPT);
        expect(result.stderr).not.toContain(NPX_INSTALL_PROMPT);
        expect(`${result.stdout}${result.stderr}`).not.toContain(ENOENT_MARKER);
      });
    },
  );

  it(
    "GIVEN TypeScript present but no ESLint flat config WHEN running lint THEN reports missing config error",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: FIXTURES.TYPESCRIPT_NO_ESLINT }, async ({ path }) => {
        const result = await execa("node", [CLI_PATH, "validation", "lint"], {
          cwd: path,
          reject: false,
        });

        expect(result.exitCode).not.toBe(EXIT_SUCCESS);
        const combinedOutput = `${result.stdout}${result.stderr}`;
        expect(combinedOutput).toContain(MISSING_CONFIG_MARKER);
        expect(combinedOutput).not.toContain(NPX_INSTALL_PROMPT);
      });
    },
  );
});
