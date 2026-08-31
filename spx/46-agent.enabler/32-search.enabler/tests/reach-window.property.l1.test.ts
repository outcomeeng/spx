import { describe, it } from "vitest";

import { arbitraryBetweenReachWindowsScenario, arbitrarySinceWindowScenario } from "@testing/generators/agent/search";
import { searchAndResumeBetweenReachWindows, searchSinceWindowStore } from "@testing/harnesses/agent/search";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("agent search — reach window", () => {
  it("admits exactly the sessions whose activity falls within the requested since duration", async () => {
    await assertProperty(
      arbitrarySinceWindowScenario(),
      async (scenario): Promise<boolean> => {
        const results = await searchSinceWindowStore(scenario, {
          branch: scenario.branch,
          sinceMs: scenario.sinceMs,
        });
        return results.map((result) => result.sessionId).join() === scenario.insideSessionId;
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("applies its own default reach window rather than the window resume applies", async () => {
    await assertProperty(
      arbitraryBetweenReachWindowsScenario(),
      async (scenario): Promise<boolean> => {
        const observation = await searchAndResumeBetweenReachWindows(scenario);
        return observation.searched.map((result) => result.sessionId).join() === scenario.sessionId
          && observation.resumable.every((candidate) => candidate.sessionId !== scenario.sessionId);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
