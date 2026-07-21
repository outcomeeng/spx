import { describe, expect, it } from "vitest";

import {
  REVIEW_FINDING_IDENTITY_RULE,
  reviewFindingIdentityFields,
  reviewRunSetFindingIdentity,
  reviewRunSetScopeUnitKey,
  reviewScopeUnitKey,
} from "@/domains/verify/review-run-set";
import { findingIdentityKey } from "@/domains/verify/run-set";
import { VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import type { JsonValue } from "@/lib/agent-run-journal";
import { VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("review run-set identity properties", () => {
  it("composes review finding identity from the review type, anchor subject, and SPX summary, invariant under display-field changes", () => {
    assertProperty(
      VERIFY_TEST_GENERATOR.reviewFindingDisplayVariantPair(),
      ({ base, variant }) => {
        const fields = reviewFindingIdentityFields(base);
        expect(fields.verificationType).toBe(VERIFY_VERIFICATION_TYPE.REVIEW);
        expect(fields.rule).toBe(REVIEW_FINDING_IDENTITY_RULE);
        expect(fields.fingerprint).toBe(base.finding.summary);
        expect(findingIdentityKey(reviewFindingIdentityFields(variant))).toBe(findingIdentityKey(fields));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
    assertProperty(
      VERIFY_TEST_GENERATOR.reviewFindingIdentityDivergentPair(),
      ({ base, divergent }) => {
        expect(findingIdentityKey(reviewFindingIdentityFields(divergent))).not.toBe(
          findingIdentityKey(reviewFindingIdentityFields(base)),
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("keeps the reviewed-unit scope key on the anchor side and path, invariant under coverage and display-field changes", () => {
    assertProperty(
      VERIFY_TEST_GENERATOR.reviewScopeUnitDisplayVariantPair(),
      ({ base, variant }) => {
        expect(reviewScopeUnitKey(variant)).toBe(reviewScopeUnitKey(base));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
    assertProperty(
      VERIFY_TEST_GENERATOR.reviewScopeUnitKeyDivergentPair(),
      ({ base, divergent }) => {
        expect(reviewScopeUnitKey(divergent)).not.toBe(reviewScopeUnitKey(base));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("keeps the payload-shaped adapters total over validated and non-conforming payloads", () => {
    assertProperty(
      VERIFY_TEST_GENERATOR.reviewFinding(),
      (finding) => {
        expect(reviewRunSetFindingIdentity(finding as unknown as JsonValue)).toEqual(
          reviewFindingIdentityFields(finding),
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
    assertProperty(
      VERIFY_TEST_GENERATOR.invalidReviewFinding(),
      (payload) => {
        const canonical = JSON.stringify(payload);
        expect(reviewRunSetFindingIdentity(payload as JsonValue)).toEqual({
          verificationType: VERIFY_VERIFICATION_TYPE.REVIEW,
          normalizedSubject: canonical,
          rule: REVIEW_FINDING_IDENTITY_RULE,
          fingerprint: canonical,
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
    assertProperty(
      VERIFY_TEST_GENERATOR.reviewScopeUnit(),
      (unit) => {
        expect(reviewRunSetScopeUnitKey(unit as unknown as JsonValue)).toBe(reviewScopeUnitKey(unit));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
    assertProperty(
      VERIFY_TEST_GENERATOR.invalidReviewScopeUnit(),
      (payload) => {
        expect(reviewRunSetScopeUnitKey(payload as JsonValue)).toBe(JSON.stringify(payload));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
