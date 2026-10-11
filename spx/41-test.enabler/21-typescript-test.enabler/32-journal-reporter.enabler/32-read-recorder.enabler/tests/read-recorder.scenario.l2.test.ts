import { describe, expect, it } from "vitest";

import { observeRecordedReadRun } from "@testing/harnesses/testing/read-recorder";

describe("read recorder over a real Vitest module", () => {
  it("leaves the absolute path of the data file the module read in the module's metadata", async () => {
    await observeRecordedReadRun().then((observation) => {
      expect(observation.recordedPaths).toContain(observation.dataFilePath);
    });
  });
});
