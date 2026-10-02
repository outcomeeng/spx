import { describe, expect, it } from "vitest";

import { detectLanguages, PYTHON_MARKER, TYPESCRIPT_MARKER } from "@/validation/discovery/language-finder";
import { withLanguageMarkerProduct } from "@testing/harnesses/language-detection/language-detection";

describe("detectLanguages — scenarios", () => {
  it("identifies TypeScript when the product has tsconfig.json", async () => {
    await withLanguageMarkerProduct([TYPESCRIPT_MARKER], (productDir) => {
      const result = detectLanguages(productDir);

      expect(result.typescript.present).toBe(true);
      expect(result.python.present).toBe(false);
    });
  });

  it("identifies Python when the product has pyproject.toml", async () => {
    await withLanguageMarkerProduct([PYTHON_MARKER], (productDir) => {
      const result = detectLanguages(productDir);

      expect(result.typescript.present).toBe(false);
      expect(result.python.present).toBe(true);
    });
  });

  it("identifies both languages when the product has tsconfig.json and pyproject.toml", async () => {
    await withLanguageMarkerProduct([TYPESCRIPT_MARKER, PYTHON_MARKER], (productDir) => {
      const result = detectLanguages(productDir);

      expect(result.typescript.present).toBe(true);
      expect(result.python.present).toBe(true);
    });
  });

  it("identifies no languages when the product has neither marker file", async () => {
    await withLanguageMarkerProduct([], (productDir) => {
      const result = detectLanguages(productDir);

      expect(result.typescript.present).toBe(false);
      expect(result.python.present).toBe(false);
    });
  });
});
