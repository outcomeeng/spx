import { describe, it } from "vitest";

import { AGENT_SEARCH_MATCH_REASON } from "@/domains/agent/protocol";

import { arbitraryMovingSessionBranchScenario } from "@testing/generators/agent/search";
import { searchMovingSessionStore } from "@testing/harnesses/agent/search";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("agent search — branch association over a session's recorded history", () => {
  it("returns a session for a branch its transcript records at any position", async () => {
    await assertProperty(
      arbitraryMovingSessionBranchScenario(),
      async (scenario): Promise<boolean> => {
        const observation = await searchMovingSessionStore(scenario, { branch: scenario.targetBranch });
        const [result] = observation.results;
        return observation.results.length === 1
          && result !== undefined
          && result.sessionId === scenario.sessionId
          && result.cwd === scenario.branchRecordCwd
          && result.matches.includes(AGENT_SEARCH_MATCH_REASON.BRANCH);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
