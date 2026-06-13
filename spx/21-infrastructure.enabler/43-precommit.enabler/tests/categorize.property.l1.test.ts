import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { categorizeFile, filterTestRelevantFiles } from "@/lib/precommit/categorize";
import { PRECOMMIT_TEST_GENERATOR } from "@testing/generators/precommit/precommit";

describe("categorizeFile properties", () => {
  it("is deterministic: same path always produces the same category", () => {
    fc.assert(
      fc.property(PRECOMMIT_TEST_GENERATOR.path(), (path) => {
        expect(categorizeFile(path)).toBe(categorizeFile(path));
      }),
    );
  });
});

describe("filterTestRelevantFiles properties", () => {
  it("is idempotent: filtering twice equals filtering once", () => {
    fc.assert(
      fc.property(PRECOMMIT_TEST_GENERATOR.fileList(), (files) => {
        const once = filterTestRelevantFiles(files);
        expect(filterTestRelevantFiles(once)).toEqual(once);
      }),
    );
  });
});
