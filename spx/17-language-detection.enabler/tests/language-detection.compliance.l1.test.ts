import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  detectLanguages,
  ESLINT_CONFIG_FILES,
  ESLINT_PRODUCTION_CONFIG_FILES,
  type LanguageDetectionDeps,
  PYTHON_MARKER,
  TYPESCRIPT_MARKER,
} from "@/validation/discovery/language-finder";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";

describe("detectLanguages — compliance", () => {
  it("probes source-owned marker and config file names rather than walking directories", () => {
    const productDir = sampleLiteralTestValue(arbitraryDomainLiteral());
    const probedPaths: string[] = [];
    const existingPaths = new Set([join(productDir, TYPESCRIPT_MARKER)]);
    const deps: LanguageDetectionDeps = {
      existsSync: (filePath: string) => {
        probedPaths.push(filePath);
        return existingPaths.has(filePath);
      },
    };

    detectLanguages(productDir, deps);

    expect(probedPaths).toEqual([
      join(productDir, TYPESCRIPT_MARKER),
      ...ESLINT_CONFIG_FILES.map((configFile) => join(productDir, configFile)),
      ...ESLINT_PRODUCTION_CONFIG_FILES.map((configFile) => join(productDir, configFile)),
      join(productDir, PYTHON_MARKER),
    ]);
  });
});
