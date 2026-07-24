import { describe, expect, it } from "vitest";

import { EVIDENCE_REQUIREMENT } from "@/domains/verify/evidence-rejection";
import {
  evidenceValidatorFor,
  VERIFY_EVIDENCE_KIND,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import {
  arbitraryReviewFindingMissingRequiredField,
  arbitraryReviewFindingWithoutAnchor,
  arbitraryReviewScopeMissingRequiredField,
  sampleVerifyTestValue,
} from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("review evidence validation", () => {
  it("names the missing required field when it rejects a review scope payload", () => {
    assertProperty(
      arbitraryReviewScopeMissingRequiredField(),
      (scenario) => {
        const result = evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.REVIEW, VERIFY_EVIDENCE_KIND.SCOPE)?.({
          payload: scenario.payload,
          events: [],
          selector: {
            scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
            scopeIdentity: sampleReviewScopeIdentity(),
          },
        });
        expect(result?.ok).toBe(false);
        expect(result?.ok === false ? result.reason : "").toContain(scenario.missingField);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("names the missing required field when it rejects a review finding payload", () => {
    assertProperty(
      arbitraryReviewFindingMissingRequiredField(),
      (scenario) => {
        const result = evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.REVIEW, VERIFY_EVIDENCE_KIND.FINDING)?.({
          payload: scenario.payload,
          events: [],
          selector: {
            scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
            scopeIdentity: sampleReviewScopeIdentity(),
          },
        });
        expect(result?.ok).toBe(false);
        expect(result?.ok === false ? result.reason : "").toContain(scenario.missingField);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("names the unmet structural requirement when a review scope payload is not a JSON object", () => {
    const result = evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.REVIEW, VERIFY_EVIDENCE_KIND.SCOPE)?.({
      payload: sampleReviewScopeIdentity(),
      events: [],
      selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: sampleReviewScopeIdentity() },
    });
    expect(result?.ok).toBe(false);
    expect(result?.ok === false ? result.reason : "").toContain(EVIDENCE_REQUIREMENT.PAYLOAD_IS_OBJECT);
  });

  it("names the unmet structural requirement when a review finding payload is not a JSON object", () => {
    const result = evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.REVIEW, VERIFY_EVIDENCE_KIND.FINDING)?.({
      payload: sampleReviewScopeIdentity(),
      events: [],
      selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: sampleReviewScopeIdentity() },
    });
    expect(result?.ok).toBe(false);
    expect(result?.ok === false ? result.reason : "").toContain(EVIDENCE_REQUIREMENT.PAYLOAD_IS_OBJECT);
  });

  it("names the unmet structural requirement when a review finding anchors to neither line nor position", () => {
    assertProperty(
      arbitraryReviewFindingWithoutAnchor(),
      (payload) => {
        const result = evidenceValidatorFor(VERIFY_VERIFICATION_TYPE.REVIEW, VERIFY_EVIDENCE_KIND.FINDING)?.({
          payload,
          events: [],
          selector: { scopeType: VERIFY_SCOPE_TYPE.CHANGESET, scopeIdentity: sampleReviewScopeIdentity() },
        });
        expect(result?.ok).toBe(false);
        expect(result?.ok === false ? result.reason : "").toContain(EVIDENCE_REQUIREMENT.REVIEW_FINDING_ANCHOR);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});

function sampleReviewScopeIdentity(): string {
  return sampleVerifyTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
}
