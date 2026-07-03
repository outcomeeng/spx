import { describe, expect, it } from "vitest";

import { AGENT_SESSION_KIND } from "@/domains/agent/protocol";
import {
  AGENT_SEARCH_DEFAULT_LIMIT,
  AGENT_SEARCH_MATCH_REASON,
  type AgentSearchQuery,
  agentSearchQueryFromOptions,
  type AgentSearchQueryOptions,
} from "@/domains/agent/search";
import { formatSessionOutputMarker, SESSION_OUTPUT_MARKER } from "@/domains/session/types";
import {
  arbitraryAgentBranch,
  arbitraryAgentSessionId,
  sampleAgentResumeValue,
} from "@testing/generators/agent/resume";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

describe("agent session search option mappings", () => {
  const pickupId = sampleAgentResumeValue(arbitraryDomainLiteral());
  const contains = sampleAgentResumeValue(arbitraryDomainLiteral(), 1);
  const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), 2);
  const branch = sampleAgentResumeValue(arbitraryAgentBranch(), 3);
  const explicitLimit = AGENT_SEARCH_DEFAULT_LIMIT + 1;

  const mappingCases: readonly {
    readonly name: string;
    readonly options: AgentSearchQueryOptions;
    readonly assertQuery: (query: AgentSearchQuery) => void;
  }[] = [
    {
      name: "pickup id maps to exact pickup-marker content search",
      options: { pickupId },
      assertQuery: (query) =>
        expect(query.contentNeedles).toEqual([
          {
            reason: AGENT_SEARCH_MATCH_REASON.PICKUP_ID,
            value: formatSessionOutputMarker(SESSION_OUTPUT_MARKER.PICKUP_ID, pickupId),
          },
        ]),
    },
    {
      name: "literal content maps to transcript content search",
      options: { contains },
      assertQuery: (query) =>
        expect(query.contentNeedles).toEqual([
          { reason: AGENT_SEARCH_MATCH_REASON.CONTAINS, value: contains },
        ]),
    },
    {
      name: "agent session id maps to session metadata",
      options: { sessionId },
      assertQuery: (query) => expect(query.sessionId).toBe(sessionId),
    },
    {
      name: "branch maps to branch metadata",
      options: { branch },
      assertQuery: (query) => expect(query.branch).toBe(branch),
    },
    {
      name: "agent kind maps to the selected adapter set",
      options: { agent: AGENT_SESSION_KIND.CLAUDE_CODE },
      assertQuery: (query) => expect(query.agent).toBe(AGENT_SESSION_KIND.CLAUDE_CODE),
    },
    {
      name: "limit maps to maximum result count",
      options: { limit: explicitLimit },
      assertQuery: (query) => expect(query.limit).toBe(explicitLimit),
    },
    {
      name: "all maps to removing the recent-session bound",
      options: { all: true },
      assertQuery: (query) => expect(query.includeAll).toBe(true),
    },
  ];

  it.each(mappingCases)("maps $name", ({ options, assertQuery }) => {
    assertQuery(agentSearchQueryFromOptions(options));
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
