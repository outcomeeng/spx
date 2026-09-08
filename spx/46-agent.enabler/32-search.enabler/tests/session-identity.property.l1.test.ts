import { describe, it } from "vitest";

import { arbitraryPathShapedSessionId, arbitrarySessionIdentityScenario } from "@testing/generators/agent/search";
import { searchSessionIdentityStore } from "@testing/harnesses/agent/search";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

import * as fc from "fast-check";

describe("agent search — session identity", () => {
  it("returns the addressed session whichever product the invocation addresses", async () => {
    await assertProperty(
      arbitrarySessionIdentityScenario(),
      async (scenario): Promise<boolean> => {
        const observation = await searchSessionIdentityStore(scenario, { sessionId: scenario.sessionId });
        return observation.results.map((result) => result.sessionId).join() === scenario.sessionId;
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("reports an in-product recorded working directory when the transcript records one", async () => {
    await assertProperty(
      arbitrarySessionIdentityScenario(),
      async (scenario): Promise<boolean> => {
        const observation = await searchSessionIdentityStore(scenario, { sessionId: scenario.sessionId });
        const reported = observation.results.map((result) => result.cwd);
        return reported.length === 1 && reported.every((cwd) => scenario.acceptableCwds.includes(cwd));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("hands a session id to the store only as the locator's needle, whatever characters it carries", async () => {
    await assertProperty(
      arbitrarySessionIdentityScenario().chain((scenario) =>
        fc.tuple(fc.constant(scenario), fc.oneof(fc.constant(scenario.sessionId), arbitraryPathShapedSessionId()))
      ),
      async ([scenario, sessionId]): Promise<boolean> => {
        const observation = await searchSessionIdentityStore(scenario, { sessionId });
        const readPaths = [...observation.fs.headReadPaths(), ...observation.fs.textReadPaths()];
        return observation.locator.needles().includes(sessionId)
          && readPaths.every((path) => observation.storedPaths.includes(path))
          && observation.fs.statPaths().every((path) => observation.storedPaths.includes(path));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
