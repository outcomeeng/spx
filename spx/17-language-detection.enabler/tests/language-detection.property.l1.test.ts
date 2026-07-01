import * as fc from "fast-check";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  detectLanguages,
  type LanguageDetectionDeps,
  PYTHON_MARKER,
  TYPESCRIPT_MARKER,
} from "@/validation/discovery/language-finder";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

function makeDeps(existing: ReadonlySet<string>): LanguageDetectionDeps {
  return {
    existsSync: (filePath: string) => existing.has(filePath),
  };
}

describe("detectLanguages — properties", () => {
  it("is deterministic for the same product root and dependency view", () => {
    fc.assert(
      fc.property(arbitraryDomainLiteral(), fc.boolean(), fc.boolean(), (root, hasTs, hasPy) => {
        const existing = new Set([
          ...(hasTs ? [join(root, TYPESCRIPT_MARKER)] : []),
          ...(hasPy ? [join(root, PYTHON_MARKER)] : []),
        ]);
        const deps = makeDeps(existing);
        const expected = {
          typescript: hasTs
            ? {
              present: true,
              eslintConfigFile: undefined,
              productionEslintConfigFile: undefined,
            }
            : { present: false },
          python: { present: hasPy },
        };

        const first = detectLanguages(root, deps);
        const second = detectLanguages(root, deps);

        expect(first).toEqual(expected);
        expect(second).toEqual(expected);
        expect(second).toEqual(first);
      }),
    );
  });
});
