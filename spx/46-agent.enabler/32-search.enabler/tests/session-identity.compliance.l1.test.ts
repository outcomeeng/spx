import { describe, expect, it } from "vitest";

import { arbitrarySessionIdentityScenario, arbitraryUnsafeSessionIdScenario } from "@testing/generators/agent/search";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { searchSessionIdentityStore, searchUnsafeSessionIdStore } from "@testing/harnesses/agent/search";

describe("agent search — session address bound", () => {
  it("lists no session-store project directory when resolving a session id", async () => {
    const scenario = sampleGeneratedValue(arbitrarySessionIdentityScenario());
    const observation = await searchSessionIdentityStore(scenario, { sessionId: scenario.sessionId });

    expect(observation.fs.readDirPaths()).toContain(observation.storeRoot);
    for (const projectDir of observation.projectDirs) {
      expect(observation.fs.readDirPaths()).not.toContain(projectDir);
    }
  });

  it("reads nothing for a session id that names no single store entry", async () => {
    const observation = await searchUnsafeSessionIdStore(sampleGeneratedValue(arbitraryUnsafeSessionIdScenario()));

    expect(observation.attempts.length).toBeGreaterThan(0);
    for (const attempt of observation.attempts) {
      expect(attempt.results).toHaveLength(0);
      expect(attempt.readPaths).toHaveLength(0);
    }
  });
});
