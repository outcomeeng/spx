import { describe, expect, it } from "vitest";

import { validateReviewFinding, validateReviewScope, validateReviewTerminalMetadata } from "@/domains/verify/verify";
import type { JsonValue } from "@/lib/agent-run-journal";
import { VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("review payload conformance", () => {
  it("conforms review envelope payloads to the platform-neutral review envelope schema", () => {
    assertProperty(
      VERIFY_TEST_GENERATOR.reviewTerminalMetadataVariants(),
      (variants) => {
        for (const envelope of variants) {
          expect(validateReviewTerminalMetadata(envelope as unknown as JsonValue)).toEqual(envelope);
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
    assertProperty(
      VERIFY_TEST_GENERATOR.invalidReviewTerminalMetadata(),
      (payload) => {
        expect(validateReviewTerminalMetadata(payload as JsonValue)).toBeUndefined();
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("conforms review scope payloads to the platform-neutral reviewed-unit schema", () => {
    assertProperty(
      VERIFY_TEST_GENERATOR.reviewScopeUnit(),
      (unit) => {
        expect(validateReviewScope(unit as unknown as JsonValue)).toEqual(unit);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
    assertProperty(
      VERIFY_TEST_GENERATOR.invalidReviewScopeUnit(),
      (payload) => {
        expect(validateReviewScope(payload as JsonValue)).toBeUndefined();
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("conforms review finding payloads to the platform-neutral review comment schema with required SPX finding metadata", () => {
    assertProperty(
      VERIFY_TEST_GENERATOR.reviewFinding(),
      (finding) => {
        expect(validateReviewFinding(finding as unknown as JsonValue)).toEqual(finding);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
    assertProperty(
      VERIFY_TEST_GENERATOR.invalidReviewFinding(),
      (payload) => {
        expect(validateReviewFinding(payload as JsonValue)).toBeUndefined();
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
