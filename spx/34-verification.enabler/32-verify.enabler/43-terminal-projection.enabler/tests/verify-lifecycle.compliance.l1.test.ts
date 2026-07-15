import { describe, it } from "vitest";

import {
  assertBlankTerminalStatusRejectedWithoutCompletion,
  assertCleanReviewRunRejectsForeignTerminalStatus,
  assertFinishProjectionWorksWithoutJournalBinding,
  assertFinishRejectsRawUnterminalRun,
  assertFinishRejectsUnsupportedScopeAndMalformedScope,
  assertFinishRejectsUnsupportedVerificationTypeBeforeLookup,
  assertInvalidReviewTerminalMetadataRejectedWithoutCompletion,
  assertInvalidTerminalStatusRejectedWithoutCompletion,
  assertRepeatedFinishProjectsWhenSealMarkerUnreadable,
  assertRepeatedFinishRejectsRecordedInputSelectorMismatch,
  assertRepeatedFinishRetriesPhysicalSeal,
  assertRepeatedFinishReturnsExistingProjection,
  assertReviewCommentedTerminalMetadataAcceptsCallerTerminalStatus,
  assertReviewFindingScopeRejectsApprovedTerminalStatus,
  assertReviewFindingsRejectApprovedTerminalStatus,
  assertReviewTerminalMetadataConflictRejectsWithoutSealing,
  assertSecondFinishKeepsFirstProjection,
} from "@testing/harnesses/verify/harness";

describe("verify finish compliance", () => {
  it("rejects a blank terminal status without recording completion or sealing", async () => {
    await assertBlankTerminalStatusRejectedWithoutCompletion();
  });

  it("rejects a terminal status outside the journal terminal-status vocabulary", async () => {
    await assertInvalidTerminalStatusRejectedWithoutCompletion();
  });

  it("rejects a review run sealing with a terminal status foreign to the review vocabulary", async () => {
    await assertCleanReviewRunRejectsForeignTerminalStatus();
  });

  it("rejects invalid verification-type terminal metadata without recording completion or sealing", async () => {
    await assertInvalidReviewTerminalMetadataRejectedWithoutCompletion();
  });

  it("rejects terminal metadata whose review state conflicts with the supplied terminal status", async () => {
    await assertReviewTerminalMetadataConflictRejectsWithoutSealing();
  });

  it("rejects approved review terminal status and metadata when finding evidence exists", async () => {
    await assertReviewFindingsRejectApprovedTerminalStatus();
  });

  it("rejects approved review terminal status and metadata when scope coverage reports a finding", async () => {
    await assertReviewFindingScopeRejectsApprovedTerminalStatus();
  });

  it("accepts commented review terminal metadata with the caller-supplied terminal status", async () => {
    await assertReviewCommentedTerminalMetadataAcceptsCallerTerminalStatus();
  });

  it("returns the existing terminal projection for a repeated finish without appending a second terminal event", async () => {
    await assertRepeatedFinishReturnsExistingProjection();
  });

  it("retries the physical journal seal without listing sibling runs when repeated finish finds terminal completion unsealed", async () => {
    await assertRepeatedFinishRetriesPhysicalSeal();
  });

  it("returns the existing terminal projection when a repeated finish cannot read the seal marker", async () => {
    await assertRepeatedFinishProjectsWhenSealMarkerUnreadable();
  });

  it("rejects an unterminal raw journal run without a recorded verification input", async () => {
    await assertFinishRejectsRawUnterminalRun();
  });

  it("returns the first terminal projection when a second finish supplies a different terminal status", async () => {
    await assertSecondFinishKeepsFirstProjection();
  });

  it("returns the idempotent terminal projection without a journal binding", async () => {
    await assertFinishProjectionWorksWithoutJournalBinding();
  });

  it("rejects repeated finish when the recorded input selector differs from the requested scope", async () => {
    await assertRepeatedFinishRejectsRecordedInputSelectorMismatch();
  });

  it("rejects an unsupported scope type or a malformed changeset scope before mutating the run", async () => {
    await assertFinishRejectsUnsupportedScopeAndMalformedScope();
  });

  it("rejects an unsupported verification type before resolving an existing run to finish", async () => {
    await assertFinishRejectsUnsupportedVerificationTypeBeforeLookup();
  });
});
