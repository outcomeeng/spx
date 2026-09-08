import { describe, expect, it } from "vitest";

import {
  arbitraryMovingSessionBranchScenario,
  arbitrarySessionIdentityScenario,
} from "@testing/generators/agent/search";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { searchMovingSessionStore, searchSessionIdentityStore } from "@testing/harnesses/agent/search";

describe("agent search — store listing bound", () => {
  it("lists no session-store project directory when resolving a session id", async () => {
    const scenario = sampleGeneratedValue(arbitrarySessionIdentityScenario());
    const observation = await searchSessionIdentityStore(scenario, { sessionId: scenario.sessionId });

    expect(observation.results.map((result) => result.sessionId)).toEqual([scenario.sessionId]);
    expect(observation.fs.readDirPaths()).toContain(observation.storeRoot);
    for (const projectDir of observation.projectDirs) {
      expect(observation.fs.readDirPaths()).not.toContain(projectDir);
    }
  });

  it("lists no session-store project directory when resolving a content selector", async () => {
    const scenario = sampleGeneratedValue(arbitraryMovingSessionBranchScenario());
    const observation = await searchMovingSessionStore(scenario, { contains: scenario.contentNeedle });

    expect(observation.results.map((result) => result.sessionId)).toEqual([scenario.sessionId]);
    for (const path of [observation.sessionPath, observation.decoyPath, observation.foreignOnlyPath]) {
      expect(observation.fs.readDirPaths()).not.toContain(path.slice(0, path.lastIndexOf("/")));
    }
  });
});
