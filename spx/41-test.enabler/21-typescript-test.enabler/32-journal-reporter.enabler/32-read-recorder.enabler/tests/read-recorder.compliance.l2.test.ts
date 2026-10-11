import { describe, expect, it } from "vitest";

import { observeRecordedReadRun } from "@testing/harnesses/testing/read-recorder";

describe("read recorder effects", () => {
  it("writes no file and no output, and leaves the value the module read unchanged", async () => {
    await observeRecordedReadRun().then((observation) => {
      expect(observation.entriesAfter).toEqual(observation.entriesBefore);
      expect(observation.consoleOutput).toEqual([]);
      expect(observation.moduleState).toBe("passed");
    });
  });
});
