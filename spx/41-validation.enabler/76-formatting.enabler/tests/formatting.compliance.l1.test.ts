import { describe, expect, it } from "vitest";

import { FORMATTING_COMMAND_OUTPUT } from "@/commands/validation/formatting";
import { formattingValidationLanguage } from "@/validation/languages/formatting";
import { validationPipelineStages, validationRegistry } from "@/validation/registry";
import { FORMATTING_VALIDATION_DATA } from "@testing/generators/validation/formatting";
import { loadProductDprintConfig, runFormattingWithoutConfig } from "@testing/harnesses/validation/formatting";

describe("formatting composes through the validation registry", () => {
  it("registers the formatting language descriptor in the registry", () => {
    expect(validationRegistry.languages).toContain(formattingValidationLanguage);
  });

  it("contributes its stages to the registry-composed pipeline", () => {
    expect(validationPipelineStages).toEqual(
      expect.arrayContaining([...formattingValidationLanguage.stages]),
    );
  });

  it("composes formatting as the final stage in registry order, not a hardcoded index", () => {
    const lastStage = validationPipelineStages.at(-1);
    expect(lastStage).toBeDefined();
    expect(formattingValidationLanguage.stages).toContain(lastStage);
  });
});

describe("formatting never rewrites the excluded paths", () => {
  const config = loadProductDprintConfig();

  for (const neverPath of FORMATTING_VALIDATION_DATA.neverFormattedPaths) {
    it(`keeps ${neverPath} out of the formatted set`, () => {
      expect(config.excludes.some((pattern) => pattern.includes(neverPath))).toBe(true);
    });
  }
});

describe("formatting skips when the product root has no dprint.jsonc", () => {
  it("exits zero and reports the skip without letting a global config decide", async () => {
    const result = await runFormattingWithoutConfig();

    expect(result.exitCode).toBe(FORMATTING_VALIDATION_DATA.passExitCode);
    expect(result.output).toContain(FORMATTING_COMMAND_OUTPUT.NO_CONFIG_SKIP_REASON);
  });
});
