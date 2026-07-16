import { describe, expect, it } from "vitest";

import { AGENT_SEARCH_MATCH_REASON, AGENT_SESSION_KIND } from "@/domains/agent/protocol";

import { withPiSearchBranchEvidence, withPiSearchPickupEvidence } from "@testing/harnesses/agent/pi-search";
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

  it("finds valid product-scoped Pi sessions alongside Codex and Claude Code", async () => {
    await withPiSearchPickupEvidence((evidence) => {
      expect(evidence.results.map((result) => result.sessionId)).toEqual(evidence.expectedSessionIds);
      expect(evidence.results.map((result) => result.agent)).toEqual([
        AGENT_SESSION_KIND.CODEX,
        AGENT_SESSION_KIND.CLAUDE_CODE,
        AGENT_SESSION_KIND.PI,
      ]);
      expect(evidence.results.map((result) => result.matches)).toEqual([
        [AGENT_SEARCH_MATCH_REASON.PICKUP_ID],
        [AGENT_SEARCH_MATCH_REASON.PICKUP_ID],
        [AGENT_SEARCH_MATCH_REASON.PICKUP_ID],
      ]);
      expect(
        evidence.invalidSessionIds.every((sessionId) =>
          evidence.results.every((result) => result.sessionId !== sessionId)
        ),
      ).toBe(true);
    });
  });

  it("associates null-branch Pi sessions only through same-product worktree roots", async () => {
    await withPiSearchBranchEvidence((evidence) => {
      expect(evidence.results).toEqual([
        expect.objectContaining({
          agent: AGENT_SESSION_KIND.PI,
          sessionId: evidence.associatedSessionId,
          cwd: evidence.associatedCwd,
          branch: null,
          matches: [evidence.branchReason],
        }),
      ]);
      expect(evidence.results.some((result) => result.sessionId === evidence.unassociatedSessionId)).toBe(false);
    });
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
