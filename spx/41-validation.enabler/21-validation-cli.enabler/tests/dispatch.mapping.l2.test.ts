import { describe, expect, it } from "vitest";

import { LITERAL_EXIT_CODES, OUTPUT_MODE_NAMES } from "@/commands/validation/literal";
import {
  LITERAL_TEST_GENERATOR,
  LITERAL_TEST_GENERATOR_COUNTS,
  literalEmptyConfig,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";
import { runValidationInProcess, validationCliEmptyOutput } from "@testing/harnesses/validation/cli";
import { literalOutputModeCliArgs } from "@testing/harnesses/validation/literal-output-mode-cli";

describe("validation CLI dispatch mappings", () => {
  it.each(OUTPUT_MODE_NAMES)("%s mode routes findings to stdout", async (mode) => {
    await withLiteralFixtureEnv(literalEmptyConfig(), async (env) => {
      const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
      await env.writeReuseFixture(inputs);

      const result = await runValidationInProcess(literalOutputModeCliArgs(mode), {
        processCwd: () => env.productDir,
      });

      expect(result.exitCode).toBe(LITERAL_EXIT_CODES.FINDINGS);
      expect(result.stdout.length).toBeGreaterThan(LITERAL_TEST_GENERATOR_COUNTS.none);
      expect(result.stderr).toBe(validationCliEmptyOutput());
    });
  });
});
