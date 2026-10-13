import { describe, expect, it } from "vitest";

import {
  formatTypeScriptAbsentSkipMessage,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_EXIT_CODES,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "@/commands/validation/messages";
import { VALIDATION_RUNTIME_ANTI_MARKERS } from "@/commands/validation/runtime-diagnostics";
import { LINT_SUBPROCESS_TIMEOUT, observeLintSubprocess } from "@testing/harnesses/validation/lint-pipeline";
import { PROJECT_FIXTURES } from "@testing/harnesses/with-validation-env";

describe("lint validation subprocess", () => {
  it("reports an ESLint success verdict for a clean TypeScript product with a flat config", async () => {
    const result = await observeLintSubprocess(PROJECT_FIXTURES.CLEAN_PROJECT);

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain(VALIDATION_COMMAND_OUTPUT.ESLINT_SUCCESS);
    expect(result.stdout).not.toContain(formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.ESLINT));
  }, LINT_SUBPROCESS_TIMEOUT);

  it("reports an explicit skip and no npx install prompt for a Python product", async () => {
    const result = await observeLintSubprocess(PROJECT_FIXTURES.PYTHON_PROJECT);

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain(formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.ESLINT));
    expect(`${result.stdout}${result.stderr}`).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
  }, LINT_SUBPROCESS_TIMEOUT);

  it("reports an explicit skip and no npx install prompt for a product with no language marker", async () => {
    const result = await observeLintSubprocess(PROJECT_FIXTURES.BARE_PROJECT);

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain(formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.ESLINT));
    expect(`${result.stdout}${result.stderr}`).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
  }, LINT_SUBPROCESS_TIMEOUT);

  it("reports a missing config error for a TypeScript product without an ESLint flat config", async () => {
    const result = await observeLintSubprocess(PROJECT_FIXTURES.TYPESCRIPT_NO_ESLINT);

    expect(result.exitCode).not.toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(`${result.stdout}${result.stderr}`).toContain(VALIDATION_COMMAND_OUTPUT.ESLINT_MISSING_CONFIG);
  }, LINT_SUBPROCESS_TIMEOUT);
});
