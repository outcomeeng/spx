import { describe, expect, it } from "vitest";

import { AGENT_SESSION_KIND } from "@/domains/agent/protocol";
import {
  AGENT_SEARCH_DEFAULT_LIMIT,
  AGENT_SEARCH_MATCH_REASON,
  agentSearchQueryFromOptions,
} from "@/domains/agent/search";
import { formatSessionOutputMarker, SESSION_OUTPUT_MARKER } from "@/domains/session/types";
import {
  arbitraryAgentBranch,
  arbitraryAgentSessionId,
  sampleAgentResumeValue,
} from "@testing/generators/agent/resume";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

describe("agent session search option mappings", () => {
  it("maps search options to source-owned query fields", () => {
    const pickupId = sampleAgentResumeValue(arbitraryDomainLiteral());
    const contains = sampleAgentResumeValue(arbitraryDomainLiteral(), 1);
    const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 2);
    const branch = sampleAgentResumeValue(arbitraryAgentBranch(), 3);

    const query = agentSearchQueryFromOptions({
      pickupId,
      contains,
      sessionId,
      branch,
      agent: AGENT_SESSION_KIND.CLAUDE_CODE,
      all: true,
      limit: AGENT_SEARCH_DEFAULT_LIMIT + 1,
    });

    expect(query.contentNeedles).toEqual([
      {
        reason: AGENT_SEARCH_MATCH_REASON.PICKUP_ID,
        value: formatSessionOutputMarker(SESSION_OUTPUT_MARKER.PICKUP_ID, pickupId),
      },
      { reason: AGENT_SEARCH_MATCH_REASON.CONTAINS, value: contains },
    ]);
    expect(query.sessionId).toBe(sessionId);
    expect(query.branch).toBe(branch);
    expect(query.agent).toBe(AGENT_SESSION_KIND.CLAUDE_CODE);
    expect(query.includeAll).toBe(true);
    expect(query.limit).toBe(AGENT_SEARCH_DEFAULT_LIMIT + 1);
  });

  it("defaults to recent bounded all-agent search", () => {
    const query = agentSearchQueryFromOptions({});

    expect(query.contentNeedles).toEqual([]);
    expect(query.sessionId).toBeNull();
    expect(query.branch).toBeNull();
    expect(query.agent).toBeNull();
    expect(query.includeAll).toBe(false);
    expect(query.limit).toBe(AGENT_SEARCH_DEFAULT_LIMIT);
  });
});
