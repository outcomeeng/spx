import { describe, expect, it } from "vitest";

import { arbitraryMovingSessionBranchScenario } from "@testing/generators/agent/search";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { searchMovingSessionStore } from "@testing/harnesses/agent/search";

describe("agent search — structural read bound", () => {
  it("performs no structural metadata read on a transcript whose content lacks the selector", async () => {
    const scenario = sampleGeneratedValue(arbitraryMovingSessionBranchScenario());
    const observation = await searchMovingSessionStore(scenario, { contains: scenario.contentNeedle });

    expect(observation.fs.maxHeadReadBytes(observation.decoyPath)).toBe(0);
  });

  it("reads no transcript's full content when the invocation carries no selector", async () => {
    const scenario = sampleGeneratedValue(arbitraryMovingSessionBranchScenario());
    const observation = await searchMovingSessionStore(scenario);

    expect(observation.fs.textReadPaths()).toHaveLength(0);
  });
});
