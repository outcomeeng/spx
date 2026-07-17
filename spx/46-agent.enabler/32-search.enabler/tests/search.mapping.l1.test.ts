import { describe, expect, it } from "vitest";

import { AGENT_SEARCH_DEFAULT_LIMIT, AGENT_SEARCH_MATCH_REASON, AGENT_SESSION_KIND } from "@/domains/agent/protocol";
import { pickupIdSearchLiteral } from "@/domains/agent/search";

import { withPiSearchCliSelectionEvidence } from "@testing/harnesses/agent/pi-search";
import {
  withAgentSearchAllSessionsEvidence,
  withAgentSearchBranchCommandEvidence,
  withAgentSearchBranchCommandMappingEvidence,
  withAgentSearchDefaultQueryEvidence,
  withAgentSearchExplicitLimitEvidence,
  withAgentSearchMetadataBranchEvidence,
  withAgentSearchOlderDuplicateEvidence,
  withAgentSearchOptionMappingEvidence,
  withAgentSearchStaleMetadataEvidence,
  withAgentSearchSubagentCommandEvidence,
  withAgentSearchSubagentMetadataEvidence,
  withAgentSearchSubagentScopeEvidence,
  withAgentSearchWorktreeRootEvidence,
} from "@testing/harnesses/agent/search";

describe("agent session search option mappings", () => {
  it("maps every search option to query shape", () => {
    withAgentSearchOptionMappingEvidence((evidence) => {
      expect(evidence.pickup.query.contentNeedles).toEqual([{
        reason: AGENT_SEARCH_MATCH_REASON.PICKUP_ID,
        value: pickupIdSearchLiteral(evidence.pickup.pickupId),
      }]);
      expect(evidence.contains.query.contentNeedles).toEqual([{
        reason: AGENT_SEARCH_MATCH_REASON.CONTAINS,
        value: evidence.contains.literal,
      }]);
      expect(evidence.session.query.sessionId).toBe(evidence.session.sessionId);
      expect(evidence.branch.query.branch).toBe(evidence.branch.branch);
      expect(evidence.agent.agent).toBe(AGENT_SESSION_KIND.CLAUDE_CODE);
      expect(evidence.limit.query.limit).toBe(evidence.limit.limit);
      expect(evidence.all.includeAll).toBe(true);
    });
  });

  it("maps result-bound options to search behavior", async () => {
    await withAgentSearchExplicitLimitEvidence((evidence) => {
      expect(evidence.results.map((result) => result.sessionId)).toEqual(
        evidence.matchingSessionIds.slice(0, evidence.explicitLimit),
      );
    });
    await withAgentSearchAllSessionsEvidence((evidence) => {
      expect(evidence.results.map((result) => result.sessionId)).toEqual([
        evidence.recentSessionId,
        evidence.staleSessionId,
      ]);
    });
    await withAgentSearchOlderDuplicateEvidence((evidence) => {
      expect(evidence.results.map((result) => [result.sessionId, result.sourcePath])).toEqual([[
        evidence.sessionId,
        evidence.olderSourcePath,
      ]]);
    });
  });

  it("maps Pi agent selection to the Pi session adapter", async () => {
    await withPiSearchCliSelectionEvidence((evidence) => {
      expect(evidence.stderr).toHaveLength(0);
      expect(JSON.parse(evidence.stdout)).toEqual([
        expect.objectContaining({
          agent: AGENT_SESSION_KIND.PI,
          sessionId: evidence.expectedSessionId,
          matches: [AGENT_SEARCH_MATCH_REASON.AGENT],
        }),
      ]);
      expect(evidence.excludedSessionIds.every((sessionId) => !evidence.stdout.includes(sessionId))).toBe(true);
    });
  });

  it("maps accepted branch command evidence to branch association", () => {
    withAgentSearchBranchCommandMappingEvidence((evidence) => {
      expect(evidence.declaredCases.every((observation) => observation.accepted === observation.input.expected)).toBe(
        true,
      );
      expect(evidence.failedAccepted.every((accepted) => !accepted)).toBe(true);
      expect(evidence.incompleteAccepted.every((accepted) => !accepted)).toBe(true);
    });
  });

  it("maps branch association sources to branch matches", async () => {
    await withAgentSearchMetadataBranchEvidence((evidence) => {
      expect(evidence.results.map((result) => result.sessionId)).toEqual([
        evidence.sessionId,
        evidence.claudeSessionId,
      ]);
    });
    await withAgentSearchStaleMetadataEvidence((evidence) => {
      expect(evidence.results).toEqual([]);
    });
    await withAgentSearchWorktreeRootEvidence((evidence) => {
      expect(evidence.results.map((result) => result.sessionId)).toEqual([evidence.sessionId]);
    });
    await withAgentSearchBranchCommandEvidence((evidence) => {
      expect(evidence.results.map((result) => result.sessionId)).toEqual([
        evidence.codexSessionId,
        evidence.claudeSessionId,
      ]);
    });
    await withAgentSearchSubagentMetadataEvidence((evidence) => {
      expect(evidence.results.map((result) => result.sessionId)).toEqual([evidence.sessionId]);
    });
    await withAgentSearchSubagentCommandEvidence((evidence) => {
      expect(evidence.results.map((result) => result.sessionId)).toEqual([evidence.sessionId]);
    });
    await withAgentSearchSubagentScopeEvidence((evidence) => {
      expect(evidence.results.map((result) => result.sessionId)).toEqual([evidence.sessionId]);
    });
  });

  it("defaults to recent bounded all-agent search", () => {
    withAgentSearchDefaultQueryEvidence((evidence) => {
      expect(evidence.query.contentNeedles).toEqual([]);
      expect(evidence.query.sessionId).toBeNull();
      expect(evidence.query.branch).toBeNull();
      expect(evidence.query.agent).toBeNull();
      expect(evidence.query.includeAll).toBe(false);
      expect(evidence.query.limit).toBe(AGENT_SEARCH_DEFAULT_LIMIT);
    });
  });
});
