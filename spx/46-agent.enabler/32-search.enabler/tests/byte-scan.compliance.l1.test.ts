import { describe, expect, it } from "vitest";

import { arbitraryMovingSessionBranchScenario } from "@testing/generators/agent/search";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { searchMovingSessionStore } from "@testing/harnesses/agent/search";

describe("agent search — decode boundary", () => {
  it("decodes no transcript whose bytes lack the content needle", async () => {
    const scenario = sampleGeneratedValue(arbitraryMovingSessionBranchScenario());
    const observation = await searchMovingSessionStore(scenario, { contains: scenario.contentNeedle });

    expect(observation.fs.textReadPaths()).toContain(observation.sessionPath);
    expect(observation.fs.textReadPaths()).not.toContain(observation.decoyPath);
    expect(observation.fs.textReadPaths()).not.toContain(observation.foreignOnlyPath);
    expect(observation.fs.textReadPaths()).not.toContain(observation.outOfScopeBranchPath);
  });

  it("decodes no transcript whose bytes never name the branch, in scanning or evidence collection", async () => {
    const scenario = sampleGeneratedValue(arbitraryMovingSessionBranchScenario());
    const observation = await searchMovingSessionStore(scenario, { branch: scenario.targetBranch });

    expect(observation.fs.textReadPaths()).not.toContain(observation.decoyPath);
    expect(observation.fs.textReadPaths()).not.toContain(observation.foreignOnlyPath);
  });
});
