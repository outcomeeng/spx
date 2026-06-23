import { describe, expect, it } from "vitest";

import { FORMATTING_VALIDATION_DATA } from "@testing/generators/validation/formatting";
import { loadProductDprintConfig } from "@testing/harnesses/validation/formatting";

describe("dprint formats the spec-declared extensions and skips the excluded paths", () => {
  const config = loadProductDprintConfig();

  for (const extension of FORMATTING_VALIDATION_DATA.formattedFileExtensions) {
    it(`includes .${extension} files`, () => {
      expect(config.includedExtensions.has(extension)).toBe(true);
    });
  }

  for (const neverPath of FORMATTING_VALIDATION_DATA.neverFormattedPaths) {
    it(`excludes ${neverPath}`, () => {
      expect(config.excludes.some((pattern) => pattern.includes(neverPath))).toBe(true);
    });
  }
});
