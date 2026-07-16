import { describe, expect, it } from "vitest";

import { AGENT_SEARCH_MATCH_REASON, AGENT_SESSION_KIND } from "@/domains/agent/protocol";

import { withPiSearchCliSelectionEvidence } from "@testing/harnesses/agent/pi-search";
import {
  assertAgentSearchBranchAssociationSignalMappings,
  assertAgentSearchBranchCommandEvidenceMappings,
  assertAgentSearchDefaultsToRecentBoundedAllAgentSearch,
  assertAgentSearchOptionBehaviorMappings,
  assertAgentSearchOptionMappings,
} from "@testing/harnesses/agent/search";

describe("agent session search option mappings", () => {
  it("maps every search option to query shape", () => {
    assertAgentSearchOptionMappings();
  });

  it("maps result-bound options to search behavior", async () => {
    await assertAgentSearchOptionBehaviorMappings();
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
    assertAgentSearchBranchCommandEvidenceMappings();
  });

  it("maps branch association sources to branch matches", async () => {
    await assertAgentSearchBranchAssociationSignalMappings();
  });

  it("defaults to recent bounded all-agent search", () => {
    assertAgentSearchDefaultsToRecentBoundedAllAgentSearch();
  });
});
