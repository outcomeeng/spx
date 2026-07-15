import { describe, it } from "vitest";

import {
  assertClassificationReportsJustifyingEvidence,
  assertClassificationRetainsFactProvenance,
  assertDirectParseProviderFactRejected,
  assertGcCandidatesDeriveFromClassification,
  assertProvenanceRetainedThroughNormalization,
  assertSharedVocabularyAcrossLanguages,
} from "@testing/harnesses/outcomeeng/source-graph";

describe("source graph compliance", () => {
  it("reports the evidence category justifying every classification", () => {
    assertClassificationReportsJustifyingEvidence();
  });

  it("retains provenance alongside normalized artifact identity", () => {
    assertProvenanceRetainedThroughNormalization();
  });

  it("retains the justifying facts' provenance on classification records", () => {
    assertClassificationRetainsFactProvenance();
  });

  it("maps TypeScript, Python, and Rust facts into the same classification vocabulary", () => {
    assertSharedVocabularyAcrossLanguages();
  });

  it("derives garbage-collection candidates from classification alone", () => {
    assertGcCandidatesDeriveFromClassification();
  });

  it("rejects facts shaped like a direct implementation-source parse", () => {
    assertDirectParseProviderFactRejected();
  });
});
