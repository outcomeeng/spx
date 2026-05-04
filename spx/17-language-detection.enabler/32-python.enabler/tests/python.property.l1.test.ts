import * as fc from "fast-check";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { detectPython, type LanguageDetectionDeps, PYTHON_MARKER } from "@/validation/discovery/language-finder";

function makeDeps(existing: ReadonlySet<string>): LanguageDetectionDeps {
  return {
    existsSync: (filePath: string) => existing.has(filePath),
  };
}

describe("detectPython — properties", () => {
  it("reports present iff path.join(root, PYTHON_MARKER) is in existsSync", () => {
    fc.assert(
      fc.property(fc.string(), fc.boolean(), (root, markerPresent) => {
        const existing = new Set(markerPresent ? [join(root, PYTHON_MARKER)] : []);
        const result = detectPython(root, makeDeps(existing));
        expect(result.present).toBe(markerPresent);
      }),
    );
  });
});
