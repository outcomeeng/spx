/**
 * Exit-removal scenario over a real child process: the process that created a run root removes the
 * root and everything inside it when it ends normally.
 */

import { describe, expect, it } from "vitest";

import { TEMP_DIRECTORY_CHILD_MODE } from "@testing/harnesses/temp-directory/child-protocol";
import { runTempDirectoryChild } from "@testing/harnesses/temp-directory/process";

describe("a process that created a run root and ends normally", () => {
  it("leaves neither the root nor anything inside it", async () => {
    const run = await runTempDirectoryChild(TEMP_DIRECTORY_CHILD_MODE.CREATE);

    expect(run.exitCode).toBe(0);
    expect(run.report.root).toBeDefined();
    expect(run.report.rootExistedWhileRunning).toBe(true);
    expect(run.report.contentExistedWhileRunning).toBe(true);
    expect(run.rootExistsAfterExit).toBe(false);
    expect(run.directoryExistsAfterExit).toBe(false);
  });
});
