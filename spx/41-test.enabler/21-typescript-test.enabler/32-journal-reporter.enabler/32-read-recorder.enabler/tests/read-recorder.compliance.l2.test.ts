import { describe, expect, it } from "vitest";

import { VITEST_FILE_STATUS } from "@/test/languages/typescript";
import { observeRecorderEffects } from "@testing/harnesses/testing/read-recorder";

describe("read recorder effects", () => {
  it("adds no file, directory, or output anywhere in the run and leaves the value the module read equal to the file's content", async () => {
    const { recorded, baseline } = await observeRecorderEffects();

    expect(recorded.moduleState).toBe(VITEST_FILE_STATUS.PASSED);
    expect(recorded.readContent).toBe(recorded.dataFileContent);
    expect(recorded.readContent).toEqual(baseline.readContent);
    expect(recorded.files).toEqual(baseline.files);
    expect(recorded.consoleOutput).toEqual(baseline.consoleOutput);
  });
});
