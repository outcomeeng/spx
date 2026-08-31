import { describe, expect, it } from "vitest";

import { arbitraryMovingSessionBranchScenario } from "@testing/generators/agent/search";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { searchMovingSessionStore } from "@testing/harnesses/agent/search";

describe("agent search — branch association scope boundary", () => {
  it("omits a session recording neither the branch nor any working directory in the product", async () => {
    const scenario = sampleGeneratedValue(arbitraryMovingSessionBranchScenario());
    const observation = await searchMovingSessionStore(scenario, { branch: scenario.targetBranch });

    expect(observation.results.map((result) => result.sessionId)).not.toContain(scenario.foreignOnlySessionId);
  });
});
