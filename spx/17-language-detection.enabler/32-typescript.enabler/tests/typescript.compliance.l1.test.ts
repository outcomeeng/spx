import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  detectTypeScript,
  ESLINT_CONFIG_FILES,
  ESLINT_PRODUCTION_CONFIG_FILES,
  type LanguageDetectionDeps,
  TYPESCRIPT_MARKER,
} from "@/validation/discovery/language-finder";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";

describe("detectTypeScript — compliance", () => {
  it("probes the TypeScript marker in the product root", () => {
    const productDir = sampleLiteralTestValue(arbitraryDomainLiteral());
    const probedPaths: string[] = [];
    const deps: LanguageDetectionDeps = {
      existsSync: (filePath: string) => {
        probedPaths.push(filePath);
        return false;
      },
    };

    detectTypeScript(productDir, deps);

    expect(probedPaths).toEqual([join(productDir, TYPESCRIPT_MARKER)]);
  });

  it("does not inspect TypeScript extension paths when the marker exists", () => {
    const productDir = sampleLiteralTestValue(arbitraryDomainLiteral());
    const probedPaths: string[] = [];
    const existingPaths = new Set([join(productDir, TYPESCRIPT_MARKER)]);
    const deps: LanguageDetectionDeps = {
      existsSync: (filePath: string) => {
        probedPaths.push(filePath);
        return existingPaths.has(filePath);
      },
    };

    detectTypeScript(productDir, deps);

    expect(probedPaths).toEqual([
      join(productDir, TYPESCRIPT_MARKER),
      ...ESLINT_CONFIG_FILES.map((configFile) => join(productDir, configFile)),
      ...ESLINT_PRODUCTION_CONFIG_FILES.map((configFile) => join(productDir, configFile)),
    ]);
  });
});
