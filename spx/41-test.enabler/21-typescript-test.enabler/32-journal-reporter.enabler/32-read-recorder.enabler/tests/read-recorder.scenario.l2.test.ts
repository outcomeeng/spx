import { describe, expect, it } from "vitest";

import { observeRecordedReadRun, READ_IMPORT_FORM } from "@testing/harnesses/testing/read-recorder";

describe("read recorder over a real Vitest module", () => {
  it("leaves the absolute path of the data file the module read in the module's metadata", async () => {
    await observeRecordedReadRun(READ_IMPORT_FORM.DEFAULT).then((observation) => {
      expect(observation.recordedPaths).toContain(observation.dataFilePath);
    });
  });

  it("leaves the absolute path of the data file the module read through a named node:fs import binding in the module's metadata", async () => {
    await observeRecordedReadRun(READ_IMPORT_FORM.NAMED).then((observation) => {
      expect(observation.recordedPaths).toContain(observation.dataFilePath);
    });
  });
});
