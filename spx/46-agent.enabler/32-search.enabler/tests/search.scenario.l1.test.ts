import { describe, it } from "vitest";

import {
  assertAgentSearchExcludesSubagentsFromBranchAssociatedResults,
  assertAgentSearchFindsPickupMarkerInProductScopedTopLevelSessions,
  assertAgentSearchFindsSessionByAcceptedBranchCommandEvidence,
  assertAgentSearchFindsSessionByBranchAssociatedWorktreeRoot,
  assertAgentSearchIncludesTranscriptMetadataBranchAssociation,
  assertAgentSearchJsonRecordsExposeMetadataAndMatchReasons,
  assertAgentSearchKeepsFallbackScopeOutsideGit,
  assertAgentSearchProductScopeUsesLinkedWorktreeRoot,
  assertAgentSearchRejectsPartiallyNumericLimitValues,
  assertAgentSearchReturnsNoBranchRootsWhenGitWorktreeListThrows,
  assertAgentSearchSanitizesInvalidLimitValues,
} from "@testing/harnesses/agent/search";

describe("agent session search scenarios", () => {
  it("resolves default product scope to the linked worktree root", async () => {
    await assertAgentSearchProductScopeUsesLinkedWorktreeRoot();
  });

  it("finds product-scoped top-level sessions by pickup marker", async () => {
    await assertAgentSearchFindsPickupMarkerInProductScopedTopLevelSessions();
  });

  it("renders JSON records with session metadata and match reasons", async () => {
    await assertAgentSearchJsonRecordsExposeMetadataAndMatchReasons();
  });

  it("warns and keeps fallback product scope when the invocation directory is outside git", async () => {
    await assertAgentSearchKeepsFallbackScopeOutsideGit();
  });

  it("sanitizes invalid limit values before writing parser errors", async () => {
    await assertAgentSearchSanitizesInvalidLimitValues();
  });

  it("rejects partially numeric limit values", async () => {
    await assertAgentSearchRejectsPartiallyNumericLimitValues();
  });

  it("finds sessions whose cwd is inside a branch-associated worktree root", async () => {
    await assertAgentSearchFindsSessionByBranchAssociatedWorktreeRoot();
  });

  it("finds product-scoped sessions associated by branch metadata", async () => {
    await assertAgentSearchIncludesTranscriptMetadataBranchAssociation();
  });

  it("finds sessions associated by accepted branch command evidence", async () => {
    await assertAgentSearchFindsSessionByAcceptedBranchCommandEvidence();
  });

  it("attributes Codex subagent branch evidence to the parent top-level session", async () => {
    await assertAgentSearchExcludesSubagentsFromBranchAssociatedResults();
  });

  it("returns no branch-associated roots when git worktree listing cannot run", async () => {
    await assertAgentSearchReturnsNoBranchRootsWhenGitWorktreeListThrows();
  });
});
