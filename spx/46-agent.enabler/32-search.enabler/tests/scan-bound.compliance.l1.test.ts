import { describe, expect, it } from "vitest";

import { arbitraryMovingSessionBranchScenario } from "@testing/generators/agent/search";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { searchMovingSessionStore } from "@testing/harnesses/agent/search";

describe("agent search — structural read bound", () => {
  it("performs no structural metadata read on a transcript the locator did not name for the content needle", async () => {
    const scenario = sampleGeneratedValue(arbitraryMovingSessionBranchScenario());
    const observation = await searchMovingSessionStore(scenario, { contains: scenario.contentNeedle });

    expect(observation.locator.namedPaths()).not.toContain(observation.decoyPath);
    expect(observation.fs.maxHeadReadBytes(observation.decoyPath)).toBe(0);
  });

  it("reads no transcript past its head and calls no locator when the invocation carries no selector", async () => {
    const scenario = sampleGeneratedValue(arbitraryMovingSessionBranchScenario());
    const observation = await searchMovingSessionStore(scenario);

    expect(observation.fs.textReadPaths()).toHaveLength(0);
    expect(observation.locator.calls()).toHaveLength(0);
  });
});
