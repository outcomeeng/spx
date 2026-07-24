import { describe, expect, it } from "vitest";

import { AGENT_SEARCH_DEFAULT_LIMIT, AGENT_SEARCH_MATCH_REASON, AGENT_SESSION_KIND } from "@/domains/agent/protocol";

import { withConfiguredAgentHomeDiscoveryEvidence } from "@testing/harnesses/agent/home";
import {
  withAgentSearchAllScopedSessionsEvidence,
  withAgentSearchBranchCommandEvidence,
  withAgentSearchBranchExistenceEvidence,
  withAgentSearchDefaultLimitEvidence,
  withAgentSearchExclusionEvidence,
  withAgentSearchMetadataBranchEvidence,
  withAgentSearchOlderBranchEvidence,
  withAgentSearchProductWideSelectorEvidence,
  withAgentSearchSelectedKindEvidence,
  withAgentSearchSelectorIntersectionEvidence,
  withAgentSearchSubagentMetadataEvidence,
  withAgentSearchWorktreeRootEvidence,
} from "@testing/harnesses/agent/search";

describe("agent session search compliance", () => {
  it("reads Codex, Claude Code, and Pi sessions from configured agent session stores", async () => {
    await withConfiguredAgentHomeDiscoveryEvidence((evidence) => {
      expect(evidence.configuredSearchOutput).toContain(evidence.configuredCodexSessionId);
      expect(evidence.configuredSearchOutput).toContain(evidence.configuredClaudeSessionId);
      expect(evidence.configuredSearchOutput).toContain(evidence.configuredPiSessionId);
      expect(evidence.configuredSearchOutput).not.toContain(evidence.defaultCodexSessionId);
      expect(evidence.configuredSearchOutput).not.toContain(evidence.defaultClaudeSessionId);
      expect(evidence.configuredSearchOutput).not.toContain(evidence.defaultPiSessionId);
      expect(evidence.defaultSearchOutput).toContain(evidence.defaultCodexSessionId);
      expect(evidence.defaultSearchOutput).toContain(evidence.defaultClaudeSessionId);
      expect(evidence.defaultSearchOutput).toContain(evidence.defaultPiSessionId);
      expect(evidence.defaultSearchOutput).not.toContain(evidence.configuredCodexSessionId);
      expect(evidence.defaultSearchOutput).not.toContain(evidence.configuredClaudeSessionId);
      expect(evidence.defaultSearchOutput).not.toContain(evidence.configuredPiSessionId);
    });
  });

  it("matches all scoped recent agent sessions when no selector is provided", async () => {
    await withAgentSearchAllScopedSessionsEvidence((evidence) => {
      expect(evidence.results.map((result) => [result.agent, result.sessionId, result.matches])).toEqual([
        [AGENT_SESSION_KIND.CODEX, evidence.codexSessionId, [AGENT_SEARCH_MATCH_REASON.ALL]],
        [AGENT_SESSION_KIND.CLAUDE_CODE, evidence.claudeSessionId, [AGENT_SEARCH_MATCH_REASON.ALL]],
      ]);
    });
  });

  it("matches only the selected agent kind for agent-only searches", async () => {
    await withAgentSearchSelectedKindEvidence((evidence) => {
      expect(evidence.results.map((result) => [result.agent, result.sessionId, result.matches])).toEqual([
        [AGENT_SESSION_KIND.CODEX, evidence.codexSessionId, [AGENT_SEARCH_MATCH_REASON.AGENT]],
      ]);
    });
  });

  it("requires every supplied selector to match the same session", async () => {
    await withAgentSearchSelectorIntersectionEvidence((evidence) => {
      expect(evidence.agentAndContent.map((result) => [result.sessionId, result.matches])).toEqual([[
        evidence.codexWithLiteral,
        [AGENT_SEARCH_MATCH_REASON.AGENT, AGENT_SEARCH_MATCH_REASON.CONTAINS],
      ]]);
      expect(evidence.sessionAndBranch.map((result) => [result.sessionId, result.matches])).toEqual([[
        evidence.sessionRightBranch,
        [AGENT_SEARCH_MATCH_REASON.SESSION_ID, AGENT_SEARCH_MATCH_REASON.BRANCH],
      ]]);
    });
  });

  it("bounds default output by result limit", async () => {
    await withAgentSearchDefaultLimitEvidence((evidence) => {
      expect(evidence.results).toHaveLength(AGENT_SEARCH_DEFAULT_LIMIT);
      expect(evidence.results.every((result) => result.agent === AGENT_SESSION_KIND.CODEX)).toBe(true);
      expect(evidence.results.map((result) => result.sessionId)).toEqual(
        evidence.matchingSessionIds.slice(0, AGENT_SEARCH_DEFAULT_LIMIT),
      );
    });
  });

  it("reaches every worktree of the invocation's product and excludes other products", async () => {
    await withAgentSearchProductWideSelectorEvidence((evidence) => {
      expect(evidence.pickupResults.map((result) => result.sessionId)).toEqual([
        evidence.invocationSessionId,
        evidence.siblingSessionId,
      ]);
      expect(evidence.containsResults.map((result) => result.sessionId)).toEqual([
        evidence.invocationSessionId,
        evidence.siblingSessionId,
      ]);
      expect(evidence.agentResults.map((result) => result.sessionId)).toEqual([
        evidence.invocationSessionId,
        evidence.siblingSessionId,
      ]);
      expect(evidence.siblingSessionIdResults.map((result) => result.sessionId)).toEqual([evidence.siblingSessionId]);
      expect(evidence.foreignSessionIdResults).toEqual([]);
    });
  });

  it("excludes stale, out-of-scope, subagent, and SPX handoff session files", async () => {
    await withAgentSearchExclusionEvidence((evidence) => {
      expect(evidence.results.map((result) => result.sessionId)).toEqual([evidence.includedSessionId]);
    });
  });

  it("returns no session for branch existence alone", async () => {
    await withAgentSearchBranchExistenceEvidence((evidence) => {
      expect(evidence.observedBranches).toEqual([evidence.targetBranch]);
      expect(evidence.results).toEqual([]);
    });
  });

  it("includes sessions associated by branch metadata", async () => {
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

  it("includes sessions associated by same-product worktree root", async () => {
    await withAgentSearchWorktreeRootEvidence((evidence) => {
      expect(evidence.results.map((result) => [result.sessionId, result.matches])).toEqual([[
        evidence.sessionId,
        [AGENT_SEARCH_MATCH_REASON.BRANCH],
      ]]);
      expect(evidence.results.map((result) => result.cwd)).toEqual([evidence.cwd]);
      expect(evidence.missingRootResults).toEqual([]);
    });
  });

  it("includes sessions associated by accepted transcript command evidence", async () => {
    await withAgentSearchBranchCommandEvidence((evidence) => {
      expect(evidence.results.map((result) => [result.sessionId, result.matches])).toEqual([
        [evidence.codexSessionId, [AGENT_SEARCH_MATCH_REASON.BRANCH]],
        [evidence.claudeSessionId, [AGENT_SEARCH_MATCH_REASON.BRANCH]],
      ]);
    });
  });

  it("excludes subagent rows from branch-associated search results", async () => {
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

  it("uses older branch evidence to associate recent top-level sessions", async () => {
    await withAgentSearchOlderBranchEvidence((evidence) => {
      expect(evidence.results.map((result) => [
        result.sessionId,
        result.cwd,
        result.sourcePath,
        result.modifiedAtMs,
        result.branch,
        result.matches,
      ])).toEqual([
        [
          evidence.commandSessionId,
          evidence.cwd,
          expect.any(String),
          evidence.nowMs,
          evidence.otherBranch,
          [AGENT_SEARCH_MATCH_REASON.BRANCH],
        ],
        [
          evidence.parentSessionId,
          evidence.subagentCwd,
          evidence.parentSourcePath,
          evidence.nowMs - 1,
          evidence.otherBranch,
          [AGENT_SEARCH_MATCH_REASON.BRANCH],
        ],
      ]);
      expect(evidence.results.some((result) => result.sessionId === evidence.outsideSessionId)).toBe(false);
      expect(evidence.results.some((result) => result.sessionId === evidence.futureSessionId)).toBe(false);
    });
  });
});
