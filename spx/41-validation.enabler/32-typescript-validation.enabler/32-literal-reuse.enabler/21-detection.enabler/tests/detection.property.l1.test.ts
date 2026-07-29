import { describe, expect, it } from "vitest";

import { buildIndex } from "@/validation/literal/index";
import {
  arbitraryDistinctLiteralIndexEntries,
  arbitraryLiteralDetectionFixture,
  LITERAL_TEST_GENERATOR_COUNTS,
} from "@testing/generators/literal/literal";
import {
  canonicalizeDetectionResult,
  collectDetectionFixture,
  collectReversedDetectionFixture,
} from "@testing/harnesses/literal-reuse/detection";
import { assertProperty, PROPERTY_CLASSIFICATION } from "@testing/harnesses/property/property";

describe("literal-reuse detection invariants", () => {
  it("is deterministic for the same fixture", () => {
    assertProperty(
      arbitraryLiteralDetectionFixture(),
      (fixture) => {
        expect(collectDetectionFixture(fixture)).toEqual(collectDetectionFixture(fixture));
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });

  it("is independent of file traversal order", () => {
    assertProperty(
      arbitraryLiteralDetectionFixture(),
      (fixture) => {
        expect(canonicalizeDetectionResult(collectReversedDetectionFixture(fixture)))
          .toEqual(canonicalizeDetectionResult(collectDetectionFixture(fixture)));
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });

  it("builds injective index keys over literal kind and value", () => {
    assertProperty(
      arbitraryDistinctLiteralIndexEntries(),
      (entries) => {
        expect(buildIndex(entries).size).toBe(LITERAL_TEST_GENERATOR_COUNTS.two);
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });
});
