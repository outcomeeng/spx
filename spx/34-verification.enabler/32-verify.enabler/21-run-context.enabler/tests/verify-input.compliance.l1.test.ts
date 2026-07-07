import { describe, it } from "vitest";

import {
  assertInputDoesNotReadFreshInputSource,
  assertInputRejectsRecordedScopeMismatch,
  assertInputRejectsTypeScopeSelectionWithoutRunToken,
  assertInputRejectsUnsupportedVerificationTypeBeforeExistingRunLookup,
  assertInputReportsReadFailureForInvalidRecordJson,
  assertInputReportsReadFailureForRecordMissingSelectorFields,
  assertInputReportsSelectorAndTargetForMissingRun,
  assertInputRequiresNonBlankRunToken,
} from "@testing/harnesses/verify/harness";

describe("verify input compliance", () => {
  it("requires a non-blank --run token", async () => {
    await assertInputRequiresNonBlankRunToken();
  });

  it("rejects a type/scope-only selection without a run token even when a run exists in the namespace", async () => {
    await assertInputRejectsTypeScopeSelectionWithoutRunToken();
  });

  it("rejects an unsupported verification type before resolving an existing run", async () => {
    await assertInputRejectsUnsupportedVerificationTypeBeforeExistingRunLookup();
  });

  it("names every run selector and searched target when the run cannot be located", async () => {
    await assertInputReportsSelectorAndTargetForMissingRun();
  });

  it("rejects an existing run token when the requested scope differs from the recorded run scope", async () => {
    await assertInputRejectsRecordedScopeMismatch();
  });

  it("replays the recorded input rather than reading a fresh input source", async () => {
    await assertInputDoesNotReadFreshInputSource();
  });

  it("reports input-read failure when the recorded input file is missing selector fields", async () => {
    await assertInputReportsReadFailureForRecordMissingSelectorFields();
  });

  it("reports input-read failure when the recorded input file is invalid JSON", async () => {
    await assertInputReportsReadFailureForInvalidRecordJson();
  });
});
