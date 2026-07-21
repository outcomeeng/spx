import { describe, expect, it } from "vitest";

import { validateReviewFinding } from "@/domains/verify/verify";
import type { JsonValue } from "@/lib/agent-run-journal";
import { VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("review payload provider-optionality properties", () => {
  it("accepts local and provider-backed review comments without requiring GitHub provider fields", () => {
    assertProperty(
      VERIFY_TEST_GENERATOR.reviewFindingAnchorVariants(),
      (variants) => {
        for (const finding of variants) {
          expect(validateReviewFinding(finding as unknown as JsonValue)).toEqual(finding);
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
