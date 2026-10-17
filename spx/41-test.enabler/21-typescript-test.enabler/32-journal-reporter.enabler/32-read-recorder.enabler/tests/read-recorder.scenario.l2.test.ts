import { describe, expect, it } from "vitest";

import { READ_RECORDER_META_KEY } from "@/test/languages/read-recorder";
import type {} from "@/test/languages/read-recorder-setup";
import { observeRecordedReadRun, READ_IMPORT_FORM, SETUP_PLACEMENT } from "@testing/harnesses/testing/read-recorder";

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

  it("leaves the absolute path of the data file the module read in the module's metadata when the built setup file runs outside every package hierarchy", async () => {
    await observeRecordedReadRun(READ_IMPORT_FORM.DEFAULT, SETUP_PLACEMENT.DETACHED_BUILD).then((observation) => {
      expect(observation.recordedPaths).toContain(observation.dataFilePath);
    });
  });

  it("leaves no recorder entry in the module's metadata when the module read no file", async () => {
    await observeRecordedReadRun(READ_IMPORT_FORM.NONE).then((observation) => {
      expect(observation.moduleMetaKeys).not.toContain(READ_RECORDER_META_KEY);
    });
  });
});
