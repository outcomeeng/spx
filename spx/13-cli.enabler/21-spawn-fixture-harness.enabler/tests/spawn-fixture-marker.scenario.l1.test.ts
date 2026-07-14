import { describe, it } from "vitest";

import { assertSpawnFixtureClosesStdoutAfterMarker } from "@testing/harnesses/process-lifecycle/spawn-fixture-scenarios";

describe("Scenario: marker-synchronized stdout closure", () => {
  it("observes the configured marker before closing the stdout read end", async () => {
    await assertSpawnFixtureClosesStdoutAfterMarker();
  });
});
