import { describe, expect, it } from "vitest";

import { AGENT_SEARCH_MATCH_REASON, AGENT_SESSION_KIND } from "@/domains/agent/protocol";

import { withPiSearchBranchEvidence, withPiSearchPickupEvidence } from "@testing/harnesses/agent/pi-search";
import {
  withAgentSearchBranchCommandEvidence,
  withAgentSearchBranchWorktreeEvidence,
  withAgentSearchFallbackScopeEvidence,
  withAgentSearchGitFailureEvidence,
  withAgentSearchJsonMetadataEvidence,
  withAgentSearchMetadataBranchEvidence,
  withAgentSearchPartialLimitEvidence,
  withAgentSearchPickupMarkerEvidence,
  withAgentSearchPoolBranchWorktreeEvidence,
  withAgentSearchProductScopeEvidence,
  withAgentSearchSubagentMetadataEvidence,
  withAgentSearchUnsafeLimitEvidence,
} from "@testing/harnesses/agent/search";

describe("agent session search scenarios", () => {
  it("resolves default product scope to the Git common-dir product root, not the worktree root", async () => {
    await withAgentSearchProductScopeEvidence((evidence) => {
      expect(evidence.resolvedRoot).toBe(evidence.productRoot);
      expect(evidence.resolvedRoot).not.toBe(evidence.worktreeRoot);
      expect(evidence.resolvedWorktreeRoot).toBe(evidence.worktreeRoot);
    });
  });

  it("associates a pool worktree's sessions by branch from a resolved product scope", async () => {
    await withAgentSearchPoolBranchWorktreeEvidence((evidence) => {
      expect(evidence.results.map((result) => [result.sessionId, result.matches])).toEqual([
        [evidence.sessionId, [evidence.branchReason]],
      ]);
    });
  });

  it("finds product-scoped top-level sessions by pickup marker", async () => {
    await withAgentSearchPickupMarkerEvidence((evidence) => {
      expect(evidence.results.map((result) => result.sessionId)).toEqual([
        evidence.codexSessionId,
        evidence.claudeSessionId,
      ]);
      expect(evidence.results.map((result) => result.agent)).toEqual([
        AGENT_SESSION_KIND.CODEX,
        AGENT_SESSION_KIND.CLAUDE_CODE,
      ]);
      expect(evidence.results.map((result) => result.matches)).toEqual([
        [AGENT_SEARCH_MATCH_REASON.PICKUP_ID],
        [AGENT_SEARCH_MATCH_REASON.PICKUP_ID],
      ]);
      expect(evidence.results.map((result) => result.cwd)).toEqual([evidence.codexCwd, evidence.claudeCwd]);
      expect(evidence.results.some((result) => result.sessionId === evidence.foreignSessionId)).toBe(false);
      expect(evidence.results.some((result) => result.sessionId === evidence.subagentSessionId)).toBe(false);
    });
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
    await withAgentSearchJsonMetadataEvidence((evidence) => {
      expect(evidence.records).toEqual([
        expect.objectContaining({
          agent: AGENT_SESSION_KIND.CODEX,
          sessionId: evidence.sessionId,
          cwd: evidence.cwd,
          sourcePath: evidence.sourcePath,
          modifiedAtMs: evidence.modifiedAtMs,
          updatedAt: evidence.updatedAt,
          branch: null,
          matches: [AGENT_SEARCH_MATCH_REASON.PICKUP_ID],
        }),
      ]);
    });
  });

  it("warns and keeps fallback product scope when the invocation directory is outside git", async () => {
    await withAgentSearchFallbackScopeEvidence((evidence) => {
      expect(evidence.stderr).toContain(evidence.warning);
      expect(evidence.stdout).toContain(evidence.sessionId);
      expect(evidence.stdout).not.toContain(evidence.foreignSessionId);
    });
  });

  it("sanitizes invalid limit values before writing parser errors", async () => {
    await withAgentSearchUnsafeLimitEvidence((evidence) => {
      expect(evidence.error).toBeInstanceOf(Error);
      expect(evidence.stderr).toContain(evidence.sanitizedLimit);
      expect(evidence.stderr).not.toContain(evidence.unsafeLimit);
    });
  });

  it("rejects partially numeric limit values", async () => {
    await withAgentSearchPartialLimitEvidence((evidence) => {
      expect(evidence.error).toBeInstanceOf(Error);
      expect(evidence.stderr).toContain(evidence.sanitizedLimit);
    });
  });

  it("finds sessions whose cwd is inside a branch-associated worktree root", async () => {
    await withAgentSearchBranchWorktreeEvidence((evidence) => {
      expect(evidence.results.map((result) => [result.sessionId, result.matches])).toEqual([
        [evidence.associatedSessionId, [AGENT_SEARCH_MATCH_REASON.BRANCH]],
        [evidence.claudeAssociatedSessionId, [AGENT_SEARCH_MATCH_REASON.BRANCH]],
      ]);
    });
  });

  it("finds product-scoped sessions associated by branch metadata", async () => {
    await withAgentSearchMetadataBranchEvidence((evidence) => {
      expect(evidence.results.map((result) => [result.sessionId, result.matches])).toEqual([
        [evidence.sessionId, [AGENT_SEARCH_MATCH_REASON.BRANCH]],
        [evidence.claudeSessionId, [AGENT_SEARCH_MATCH_REASON.BRANCH]],
      ]);
      expect(evidence.results.map((result) => result.cwd)).toEqual([evidence.cwd, evidence.claudeCwd]);
      expect(evidence.results.some((result) => result.sessionId === evidence.foreignSessionId)).toBe(false);
      expect(evidence.wrongBranchResults).toEqual([]);
    });
  });

  it("finds sessions associated by accepted branch command evidence", async () => {
    await withAgentSearchBranchCommandEvidence((evidence) => {
      expect(evidence.results.map((result) => [result.sessionId, result.matches])).toEqual([
        [evidence.codexSessionId, [AGENT_SEARCH_MATCH_REASON.BRANCH]],
        [evidence.claudeSessionId, [AGENT_SEARCH_MATCH_REASON.BRANCH]],
      ]);
    });
  });

  it("attributes Codex subagent branch evidence to the parent top-level session", async () => {
    await withAgentSearchSubagentMetadataEvidence((evidence) => {
      expect(evidence.results.map((result) => [
        result.sessionId,
        result.cwd,
        result.sourcePath,
        result.matches,
      ])).toEqual([[
        evidence.sessionId,
        evidence.evidenceCwd,
        evidence.parentSourcePath,
        [AGENT_SEARCH_MATCH_REASON.BRANCH],
      ]]);
      expect(evidence.results.some((result) => result.sessionId === evidence.subagentTranscriptId)).toBe(false);
    });
  });

  it("returns no branch-associated roots when git worktree listing cannot run", async () => {
    await withAgentSearchGitFailureEvidence((evidence) => {
      expect(evidence.roots).toEqual([]);
    });
  });
});
