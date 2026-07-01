import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { detectPython, type LanguageDetectionDeps, PYTHON_MARKER } from "@/validation/discovery/language-finder";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";

describe("detectPython — compliance", () => {
  it("probes only the Python marker in the product root", () => {
    const productDir = sampleLiteralTestValue(arbitraryDomainLiteral());
    const probedPaths: string[] = [];
    const deps: LanguageDetectionDeps = {
      existsSync: (filePath: string) => {
        probedPaths.push(filePath);
        return false;
      },
    };

    detectPython(productDir, deps);

    expect(probedPaths).toEqual([join(productDir, PYTHON_MARKER)]);
  });
});
