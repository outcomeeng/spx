import { describe, expect, it } from "vitest";

import { formattingValidationLanguage } from "@/validation/languages/formatting";
import { markdownValidationLanguage } from "@/validation/languages/markdown";
import { typescriptValidationLanguage } from "@/validation/languages/typescript";
import { validationRegistry } from "@/validation/registry";

describe("validation language registry composition", () => {
  it("exposes language descriptors with at least one named, callable stage each", () => {
    expect(validationRegistry.languages.length).toBeGreaterThan(0);
    for (const language of validationRegistry.languages) {
      expect(language.name.length).toBeGreaterThan(0);
      expect(language.stages.length).toBeGreaterThan(0);
      for (const stage of language.stages) {
        expect(stage.name.length).toBeGreaterThan(0);
        expect(stage.run).toBeInstanceOf(Function);
      }
    }
  });

  it("registers exactly the explicitly imported typescript, markdown, and formatting language descriptors", () => {
    expect(validationRegistry.languages).toEqual([
      typescriptValidationLanguage,
      markdownValidationLanguage,
      formattingValidationLanguage,
    ]);
  });

  it("total stage count is derived from the registry rather than a hardcoded pipeline constant", () => {
    const totalStagesFromRegistry = validationRegistry.languages.flatMap((language) => language.stages).length;
    // Independent oracle from the spec mapping in validation.md — TypeScript
    // contributes 5 stages (circular deps, unused code, lint, type check,
    // literal reuse), markdown contributes 1, and formatting contributes 1.
    // Deliberately NOT derived from the descriptors: deriving the expected count
    // from the registry would make this assertion a tautology that no stage-count
    // regression could fail.
    const expectedFromSpecMapping = 5 + 1 + 1;
    expect(totalStagesFromRegistry).toBe(expectedFromSpecMapping);
  });
});
