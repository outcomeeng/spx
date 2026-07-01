import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  detectLanguages,
  type LanguageDetectionDeps,
  PYTHON_MARKER,
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

describe("detectLanguages — scenarios", () => {
  it("identifies TypeScript when the TypeScript marker exists", () => {
    const root = productDir();
    const result = detectLanguages(root, makeDeps(new Set([join(root, TYPESCRIPT_MARKER)])));

    expect(result.typescript.present).toBe(true);
    expect(result.python.present).toBe(false);
  });

  it("identifies Python when the Python marker exists", () => {
    const root = productDir();
    const result = detectLanguages(root, makeDeps(new Set([join(root, PYTHON_MARKER)])));

    expect(result.typescript.present).toBe(false);
    expect(result.python.present).toBe(true);
  });

  it("identifies both languages when both markers exist", () => {
    const root = productDir();
    const result = detectLanguages(
      root,
      makeDeps(new Set([join(root, TYPESCRIPT_MARKER), join(root, PYTHON_MARKER)])),
    );

    expect(result.typescript.present).toBe(true);
    expect(result.python.present).toBe(true);
  });

  it("identifies no languages when no markers exist", () => {
    const root = productDir();
    const result = detectLanguages(root, makeDeps(new Set()));

    expect(result.typescript.present).toBe(false);
    expect(result.python.present).toBe(false);
  });
});
