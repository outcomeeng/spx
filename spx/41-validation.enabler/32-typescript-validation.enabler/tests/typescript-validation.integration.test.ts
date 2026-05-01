/**
 * Level 2: Integration tests for the cross-cutting TypeScript validation pipeline.
 *
 * Spec: spx/41-validation.enabler/32-typescript-validation.enabler/typescript-validation.md
 *
 * Routing: Glue code (Stage 3C). Composition across TypeScript stages is
 * verified by running `spx validation all` end-to-end against real fixtures.
 * No doubles.
 */

import { execa } from "execa";
import { describe, expect, it } from "vitest";

import { CLI_PATH } from "@testing/harnesses/constants";
import { HARNESS_TIMEOUT, PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

const EXIT_SUCCESS = 0;
const NPX_INSTALL_PROMPT = "Need to install the following packages";
const ENOENT_MARKER = "ENOENT";
const ESLINT_OUTPUT_MARKER = "ESLint";
const TSC_OUTPUT_MARKER = "TypeScript";
const CIRCULAR_OUTPUT_MARKER = "Circular";
const LITERAL_OUTPUT_MARKER = "Literal";
const ESLINT_SKIP_MARKER = "Skipping ESLint";
const TSC_SKIP_MARKER = "Skipping TypeScript";
const CIRCULAR_SKIP_MARKER = "Skipping Circular";
const LITERAL_SKIP_MARKER = "Skipping Literal";
const ALL_TIMEOUT_MS = 120_000;

describe("spx validation all — TypeScript pipeline composition", () => {
  it(
    "GIVEN a clean TypeScript fixture WHEN running all validations THEN every TypeScript stage executes and exits zero",
    { timeout: ALL_TIMEOUT_MS },
    async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
        const result = await execa("node", [CLI_PATH, "validation", "all"], {
          cwd: path,
          reject: false,
        });

        expect(result.exitCode).toBe(EXIT_SUCCESS);
        expect(result.stdout).toContain(ESLINT_OUTPUT_MARKER);
        expect(result.stdout).toContain(TSC_OUTPUT_MARKER);
        expect(result.stdout).toContain(CIRCULAR_OUTPUT_MARKER);
        expect(result.stdout).toContain(LITERAL_OUTPUT_MARKER);
      });
    },
  );

  it(
    "GIVEN a Python fixture WHEN running all validations THEN every TypeScript stage reports skipped",
    { timeout: HARNESS_TIMEOUT },
    async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.PYTHON_PROJECT }, async ({ path }) => {
        const result = await execa("node", [CLI_PATH, "validation", "all"], {
          cwd: path,
          reject: false,
        });

        // No TS tool prompts for installation
        expect(result.stdout).not.toContain(NPX_INSTALL_PROMPT);
        expect(result.stderr).not.toContain(NPX_INSTALL_PROMPT);
        expect(`${result.stdout}${result.stderr}`).not.toContain(ENOENT_MARKER);

        // Every TS stage explicitly skipped because TypeScript is absent
        expect(result.stdout).toContain(ESLINT_SKIP_MARKER);
        expect(result.stdout).toContain(TSC_SKIP_MARKER);
        expect(result.stdout).toContain(CIRCULAR_SKIP_MARKER);
        expect(result.stdout).toContain(LITERAL_SKIP_MARKER);
      });
    },
  );
});
