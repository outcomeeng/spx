import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { categorizeFile, FILE_CATEGORIES, filterTestRelevantFiles } from "@/lib/precommit/categorize";
import { PRECOMMIT_DEFAULTS } from "@/lib/precommit/config";
import { PRECOMMIT_TEST_GENERATOR } from "@testing/generators/precommit/precommit";

describe("categorizeFile", () => {
  it("any path containing the test pattern maps to 'test'", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (prefix, suffix) => {
        expect(categorizeFile(`${prefix}${PRECOMMIT_DEFAULTS.testPattern}${suffix}`)).toBe(FILE_CATEGORIES.TEST);
      }),
    );
  });

  it("any path starting with a source dir and not containing the test pattern maps to 'source'", () => {
    fc.assert(
      fc.property(PRECOMMIT_TEST_GENERATOR.sourcePath(), (path) => {
        expect(categorizeFile(path)).toBe(FILE_CATEGORIES.SOURCE);
      }),
    );
  });

  it("any path that neither starts with a source dir nor contains the test pattern maps to 'other'", () => {
    fc.assert(
      fc.property(PRECOMMIT_TEST_GENERATOR.otherPath(), (path) => {
        expect(categorizeFile(path)).toBe(FILE_CATEGORIES.OTHER);
      }),
    );
  });

  it("is deterministic: same path always produces the same category", () => {
    fc.assert(
      fc.property(fc.string(), (path) => {
        expect(categorizeFile(path)).toBe(categorizeFile(path));
      }),
    );
  });
});

describe("filterTestRelevantFiles", () => {
  it("retains source and test files; excludes other files", () => {
    fc.assert(
      fc.property(
        fc.array(PRECOMMIT_TEST_GENERATOR.sourcePath()),
        fc.array(PRECOMMIT_TEST_GENERATOR.testPath()),
        fc.array(PRECOMMIT_TEST_GENERATOR.otherPath()),
        (sources, tests, others) => {
          const relevant = filterTestRelevantFiles([...sources, ...tests, ...others]);
          for (const s of sources) expect(relevant).toContain(s);
          for (const t of tests) expect(relevant).toContain(t);
          for (const o of others) expect(relevant).not.toContain(o);
        },
      ),
    );
  });

  it("is idempotent: filtering twice equals filtering once", () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (files) => {
        const once = filterTestRelevantFiles(files);
        expect(filterTestRelevantFiles(once)).toEqual(once);
      }),
    );
  });

  it("empty staged file list produces empty relevant file list", () => {
    expect(filterTestRelevantFiles([])).toEqual([]);
  });
});
