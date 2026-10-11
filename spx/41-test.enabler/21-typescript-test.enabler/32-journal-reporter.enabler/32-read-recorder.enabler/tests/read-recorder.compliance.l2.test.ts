import { describe, expect, it } from "vitest";

import { MODULE_STATE_PASSED, observeRecorderEffects } from "@testing/harnesses/testing/read-recorder";

describe("read recorder effects", () => {
  it("adds no file, directory, or output anywhere in the run and leaves the value the module read equal to the file's content", async () => {
    const { recorded, baseline } = await observeRecorderEffects();

    expect(recorded.moduleState).toBe(MODULE_STATE_PASSED);
    expect(recorded.readContent).toBe(recorded.dataFileContent);
    expect(recorded.readContent).toEqual(baseline.readContent);
    expect(recorded.files).toEqual(baseline.files);
    expect(recorded.consoleOutput).toEqual(baseline.consoleOutput);
  });
});
