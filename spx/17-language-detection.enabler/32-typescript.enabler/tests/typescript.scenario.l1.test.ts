import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  detectTypeScript,
  ESLINT_CONFIG_FILES,
  type LanguageDetectionDeps,
  TYPESCRIPT_MARKER,
} from "@/validation/discovery/language-finder";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";

function makeDeps(existing: ReadonlySet<string>): LanguageDetectionDeps {
  return {
    existsSync: (filePath: string) => existing.has(filePath),
  };
}

function productDir(): string {
  return sampleLiteralTestValue(arbitraryDomainLiteral());
}

describe("detectTypeScript — scenarios", () => {
  it("reports TypeScript present when the TypeScript marker exists", () => {
    const root = productDir();
    const result = detectTypeScript(root, makeDeps(new Set([join(root, TYPESCRIPT_MARKER)])));

    expect(result.present).toBe(true);
  });

  it("reports TypeScript absent when the TypeScript marker does not exist", () => {
    const root = productDir();
    const result = detectTypeScript(root, makeDeps(new Set()));

    expect(result.present).toBe(false);
    expect(result.eslintConfigFile).toBeUndefined();
    expect(result.productionEslintConfigFile).toBeUndefined();
  });

  it("reports TypeScript present with the ESLint config path when a flat config exists", () => {
    const root = productDir();
    const eslintConfigFile = ESLINT_CONFIG_FILES[0];
    const result = detectTypeScript(
      root,
      makeDeps(new Set([join(root, TYPESCRIPT_MARKER), join(root, eslintConfigFile)])),
    );

    expect(result.present).toBe(true);
    expect(result.eslintConfigFile).toBe(eslintConfigFile);
  });
});
