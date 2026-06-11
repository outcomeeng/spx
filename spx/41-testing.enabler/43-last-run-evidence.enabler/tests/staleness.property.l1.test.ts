import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { digestTestContents, digestTestPaths, isStalenessMatch, type StalenessInputs } from "@/testing/run-state";
import { TEST_RUN_STATE_TEST_GENERATOR } from "@testing/generators/testing/run-state";

describe("testing last-run staleness comparison", () => {
  it("treats identical recorded and current inputs as fresh", () => {
    fc.assert(
      fc.property(TEST_RUN_STATE_TEST_GENERATOR.stalenessInputs(), (inputs) => {
        expect(isStalenessMatch(inputs, inputs)).toBe(true);
      }),
    );
  });

  it("treats a change in any single recorded digest as stale", () => {
    fc.assert(
      fc.property(
        TEST_RUN_STATE_TEST_GENERATOR.stalenessInputs(),
        TEST_RUN_STATE_TEST_GENERATOR.digest(),
        TEST_RUN_STATE_TEST_GENERATOR.mutableStalenessDigestField(),
        (recorded, replacement, field) => {
          fc.pre(recorded[field] !== replacement);
          const current: StalenessInputs = { ...recorded, [field]: replacement };
          expect(isStalenessMatch(recorded, current)).toBe(false);
        },
      ),
    );
  });

  it("treats a change in the product input digest set as stale", () => {
    fc.assert(
      fc.property(
        TEST_RUN_STATE_TEST_GENERATOR.stalenessInputs(),
        TEST_RUN_STATE_TEST_GENERATOR.productInputDigest(),
        (recorded, extra) => {
          const current: StalenessInputs = {
            ...recorded,
            productInputDigests: [...recorded.productInputDigests, extra],
          };
          expect(isStalenessMatch(recorded, current)).toBe(false);
        },
      ),
    );
  });

  it("treats a same-size product input digest value change as stale", () => {
    fc.assert(
      fc.property(
        TEST_RUN_STATE_TEST_GENERATOR.stalenessInputsWithProductInputs(),
        TEST_RUN_STATE_TEST_GENERATOR.digest(),
        (recorded, replacement) => {
          const [first, ...remaining] = recorded.productInputDigests;
          fc.pre(first.digest !== replacement);
          const current: StalenessInputs = {
            ...recorded,
            productInputDigests: [{ ...first, digest: replacement }, ...remaining],
          };
          expect(isStalenessMatch(recorded, current)).toBe(false);
        },
      ),
    );
  });

  it("treats the product input digest set as unordered: reordering stays fresh", () => {
    fc.assert(
      fc.property(TEST_RUN_STATE_TEST_GENERATOR.stalenessInputs(), (recorded) => {
        fc.pre(recorded.productInputDigests.length > 1);
        const reordered: StalenessInputs = {
          ...recorded,
          productInputDigests: [...recorded.productInputDigests].reverse(),
        };
        expect(isStalenessMatch(recorded, reordered)).toBe(true);
      }),
    );
  });

  it("derives the path-set digest deterministically and independent of order", () => {
    fc.assert(
      fc.property(TEST_RUN_STATE_TEST_GENERATOR.testPaths(), (paths) => {
        expect(digestTestPaths(paths)).toBe(digestTestPaths(paths));
        expect(digestTestPaths(paths)).toBe(digestTestPaths([...paths].reverse()));
      }),
    );
  });

  it("changes the path-set digest when the set of discovered paths changes", () => {
    fc.assert(
      fc.property(TEST_RUN_STATE_TEST_GENERATOR.testPaths(), (paths) => {
        fc.pre(paths.length > 1);
        expect(digestTestPaths(paths)).not.toBe(digestTestPaths(paths.slice(1)));
      }),
    );
  });

  it("derives the content digest deterministically and changes it when content changes", () => {
    fc.assert(
      fc.property(TEST_RUN_STATE_TEST_GENERATOR.testContentEntries(), (entries) => {
        expect(digestTestContents(entries)).toBe(digestTestContents(entries));
        fc.pre(entries.length > 1);
        expect(digestTestContents(entries)).not.toBe(digestTestContents(entries.slice(1)));
      }),
    );
  });
});
