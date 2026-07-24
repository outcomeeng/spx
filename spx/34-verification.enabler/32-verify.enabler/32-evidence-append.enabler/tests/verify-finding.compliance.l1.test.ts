import { describe, expect, it } from "vitest";

import {
  arbitraryReviewFindingMissingRequiredField,
  arbitraryReviewScopeMissingRequiredField,
  sampleVerifyTestValue,
} from "@testing/generators/verify/verify";
import {
  appendReviewFindingMissingRequiredField,
  appendReviewScopeMissingRequiredField,
  assertAppendRecordsValidatedEvidencePayload,
  assertInvalidReviewFindingRejectedBeforeAppend,
  assertInvalidReviewScopeRejectedBeforeAppend,
  assertReviewFindingSelectorMismatchRejectsWithoutAppend,
  assertValidReviewFindingRecordsBoundaryEvidence,
  assertValidReviewScopeRecordsScopeEvidenceKind,
} from "@testing/harnesses/verify/harness";

describe("verify finding evidence compliance", () => {
  it("rejects a review scope payload that fails verification-type validation before appending an event", async () => {
    await assertInvalidReviewScopeRejectedBeforeAppend();
  });

  it("rejects a review finding payload that fails verification-type validation before appending an event", async () => {
    await assertInvalidReviewFindingRejectedBeforeAppend();
  });

  it("records a valid review scope payload through the scope-evidence validator", async () => {
    await assertValidReviewScopeRecordsScopeEvidenceKind();
  });

  it("records the validated evidence payload returned by the verification-type validator", async () => {
    await assertAppendRecordsValidatedEvidencePayload();
  });

  it("records a valid review finding at the finding-evidence boundary so callers carry no review schema", async () => {
    await assertValidReviewFindingRecordsBoundaryEvidence();
  });

  it("rejects finding evidence when the requested scope differs from the recorded run scope", async () => {
    await assertReviewFindingSelectorMismatchRejectsWithoutAppend();
  });

  it("reports the validation reason naming the failing field when it rejects a scope payload", async () => {
    const scenario = sampleVerifyTestValue(arbitraryReviewScopeMissingRequiredField());
    const rejected = await appendReviewScopeMissingRequiredField(scenario.payload);
    expect(rejected.exitCode).not.toBe(0);
    expect(rejected.output).toContain(scenario.missingField);
  });

  it("reports the validation reason naming the failing field when it rejects a finding payload", async () => {
    const scenario = sampleVerifyTestValue(arbitraryReviewFindingMissingRequiredField());
    const rejected = await appendReviewFindingMissingRequiredField(scenario.payload);
    expect(rejected.exitCode).not.toBe(0);
    expect(rejected.output).toContain(scenario.missingField);
  });
});
