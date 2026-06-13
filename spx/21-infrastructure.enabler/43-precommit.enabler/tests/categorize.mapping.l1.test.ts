import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { categorizeFile, FILE_CATEGORIES, filterTestRelevantFiles } from "@/lib/precommit/categorize";
import { PRECOMMIT_DEFAULTS } from "@/lib/precommit/config";
import { PRECOMMIT_TEST_GENERATOR } from "@testing/generators/precommit/precommit";

describe("categorizeFile mappings", () => {
  it("any path containing the test pattern maps to 'test'", () => {
    fc.assert(
      fc.property(
        PRECOMMIT_TEST_GENERATOR.pathFragment(),
        PRECOMMIT_TEST_GENERATOR.pathFragment(),
        (prefix, suffix) => {
          expect(categorizeFile(`${prefix}${PRECOMMIT_DEFAULTS.testPattern}${suffix}`)).toBe(FILE_CATEGORIES.TEST);
        },
      ),
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
});

describe("filterTestRelevantFiles mappings", () => {
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

  it("empty staged file list produces empty relevant file list", () => {
    expect(filterTestRelevantFiles([])).toEqual([]);
  });
});
