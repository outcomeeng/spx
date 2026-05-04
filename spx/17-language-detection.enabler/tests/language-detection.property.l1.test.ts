import * as fc from "fast-check";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  detectLanguages,
  type LanguageDetectionDeps,
  PYTHON_MARKER,
  TYPESCRIPT_MARKER,
} from "@/validation/discovery/language-finder";

function makeDeps(existing: ReadonlySet<string>): LanguageDetectionDeps {
  return {
    existsSync: (filePath: string) => existing.has(filePath),
  };
}

describe("detectLanguages — properties", () => {
  it("typescript.present and python.present each reflect whether their marker is in existsSync", () => {
    fc.assert(
      fc.property(fc.string(), fc.boolean(), fc.boolean(), (root, hasTs, hasPy) => {
        const existing = new Set([
          ...(hasTs ? [join(root, TYPESCRIPT_MARKER)] : []),
          ...(hasPy ? [join(root, PYTHON_MARKER)] : []),
        ]);
        const result = detectLanguages(root, makeDeps(existing));
        expect(result.typescript.present).toBe(hasTs);
        expect(result.python.present).toBe(hasPy);
      }),
    );
  });

  it("is deterministic: same root and deps produce equal results on repeated calls", () => {
    fc.assert(
      fc.property(fc.string(), fc.boolean(), fc.boolean(), (root, hasTs, hasPy) => {
        const existing = new Set([
          ...(hasTs ? [join(root, TYPESCRIPT_MARKER)] : []),
          ...(hasPy ? [join(root, PYTHON_MARKER)] : []),
        ]);
        const deps = makeDeps(existing);
        expect(detectLanguages(root, deps)).toEqual(detectLanguages(root, deps));
      }),
    );
  });
});
