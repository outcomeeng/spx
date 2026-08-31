import { describe, it } from "vitest";

import { AGENT_SEARCH_MATCH_REASON } from "@/domains/agent/protocol";

import { arbitraryMovingSessionBranchScenario } from "@testing/generators/agent/search";
import { searchMovingSessionStore } from "@testing/harnesses/agent/search";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("agent search — store-directory placement", () => {
  it("returns a session for a content selector whichever store directory holds its transcript", async () => {
    await assertProperty(
      arbitraryMovingSessionBranchScenario(),
      async (scenario): Promise<boolean> => {
        const observation = await searchMovingSessionStore(scenario, { contains: scenario.contentNeedle });
        const [result] = observation.results;
        return observation.results.length === 1
          && result !== undefined
          && result.sessionId === scenario.sessionId
          && result.matches.includes(AGENT_SEARCH_MATCH_REASON.CONTAINS);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
