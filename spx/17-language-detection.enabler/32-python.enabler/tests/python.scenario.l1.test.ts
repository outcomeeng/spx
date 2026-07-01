import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { detectPython, type LanguageDetectionDeps, PYTHON_MARKER } from "@/validation/discovery/language-finder";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";

function makeDeps(existing: ReadonlySet<string>): LanguageDetectionDeps {
  return {
    existsSync: (filePath: string) => existing.has(filePath),
  };
}

function productDir(): string {
  return sampleLiteralTestValue(arbitraryDomainLiteral());
}

describe("detectPython — scenarios", () => {
  it("reports Python present when the Python marker exists", () => {
    const root = productDir();
    const result = detectPython(root, makeDeps(new Set([join(root, PYTHON_MARKER)])));

    expect(result.present).toBe(true);
  });

  it("reports Python absent when the Python marker does not exist", () => {
    const root = productDir();
    const result = detectPython(root, makeDeps(new Set()));

    expect(result.present).toBe(false);
  });
});
