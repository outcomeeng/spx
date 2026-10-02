import { describe, expect, it } from "vitest";

import { detectLanguages } from "@/validation/discovery/language-finder";
import {
  LANGUAGE_DETECTION_FIXTURES,
  languageDetectionFixturePath,
} from "@testing/harnesses/language-detection/language-detection";

describe("detectLanguages — compliance: marker files only, never file extensions", () => {
  it("leaves TypeScript undetected in a Python product carrying vendored TypeScript sources but no tsconfig.json", () => {
    const result = detectLanguages(
      languageDetectionFixturePath(LANGUAGE_DETECTION_FIXTURES.PYTHON_WITH_VENDORED_TYPESCRIPT),
    );

    expect(result.typescript.present).toBe(false);
    expect(result.python.present).toBe(true);
  });

  it("leaves Python undetected in a TypeScript product carrying vendored Python sources but no pyproject.toml", () => {
    const result = detectLanguages(
      languageDetectionFixturePath(LANGUAGE_DETECTION_FIXTURES.TYPESCRIPT_WITH_VENDORED_PYTHON),
    );

    expect(result.python.present).toBe(false);
    expect(result.typescript.present).toBe(true);
  });
});
