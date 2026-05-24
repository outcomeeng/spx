import { describe, expect, it } from "vitest";

import { validationRegistry } from "@/validation/registry";

describe("validation language registry — ADR-19 compliance", () => {
  it("exposes language descriptors with at least one named, callable stage each", () => {
    expect(validationRegistry.languages.length).toBeGreaterThan(0);
    for (const language of validationRegistry.languages) {
      expect(language.name.length).toBeGreaterThan(0);
      expect(language.stages.length).toBeGreaterThan(0);
      for (const stage of language.stages) {
        expect(stage.name.length).toBeGreaterThan(0);
        expect(typeof stage.run).toBe("function");
      }
    }
  });

  it("registers explicit typescript and markdown descriptors per spx/19-language-registration.adr.md", () => {
    const names = validationRegistry.languages.map((language) => language.name);
    expect(new Set(names)).toEqual(new Set(["typescript", "markdown"]));
  });

  it("total stage count is derived from the registry rather than a hardcoded pipeline constant", () => {
    const totalStagesFromRegistry = validationRegistry.languages.flatMap((language) => language.stages).length;
    // The spec mapping in spx/41-validation.enabler/validation.md asserts:
    //   TypeScript has 5 stages (lint, type check, AST enforcement, circular dep, literal reuse)
    //   plus 1 markdown stage = 6 total
    const expectedFromSpecMapping = 5 + 1;
    expect(totalStagesFromRegistry).toBe(expectedFromSpecMapping);
  });
});
