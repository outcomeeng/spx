import { describe, expect, it } from "vitest";

import { VALIDATION_COMMAND_OUTPUT, VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import { VALIDATION_RUNTIME_ANTI_MARKERS } from "@/commands/validation/runtime-diagnostics";
import { LINT_SUBPROCESS_TIMEOUT, observeLintSubprocess } from "@testing/harnesses/validation/lint-pipeline";
import { PROJECT_FIXTURES } from "@testing/harnesses/with-validation-env";

describe("lint validation subprocess never invokes ESLint through npx without a flat config", () => {
  it(
    "shows no npx install prompt and no missing-executable failure for a TypeScript product without a flat config",
    async () => {
      const result = await observeLintSubprocess(PROJECT_FIXTURES.TYPESCRIPT_NO_ESLINT);

      expect(result.exitCode).not.toBe(VALIDATION_EXIT_CODES.SUCCESS);
      expect(`${result.stdout}${result.stderr}`).toContain(VALIDATION_COMMAND_OUTPUT.ESLINT_MISSING_CONFIG);
      expect(`${result.stdout}${result.stderr}`).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
      expect(`${result.stdout}${result.stderr}`).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.ENOENT);
    },
    LINT_SUBPROCESS_TIMEOUT,
  );

  it("shows no npx install prompt and no missing-executable failure for a Python product", async () => {
    const result = await observeLintSubprocess(PROJECT_FIXTURES.PYTHON_PROJECT);

    expect(`${result.stdout}${result.stderr}`).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
    expect(`${result.stdout}${result.stderr}`).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.ENOENT);
  }, LINT_SUBPROCESS_TIMEOUT);

  it(
    "shows no npx install prompt and no missing-executable failure for a product with no language marker",
    async () => {
      const result = await observeLintSubprocess(PROJECT_FIXTURES.BARE_PROJECT);

      expect(`${result.stdout}${result.stderr}`).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.NPX_INSTALL_PROMPT);
      expect(`${result.stdout}${result.stderr}`).not.toContain(VALIDATION_RUNTIME_ANTI_MARKERS.ENOENT);
    },
    LINT_SUBPROCESS_TIMEOUT,
  );
});
