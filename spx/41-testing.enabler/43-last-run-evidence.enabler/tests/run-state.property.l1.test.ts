import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createTestRunFile, readTestingRuns, writeTerminalTestRunState } from "@/testing/run-state";
import { TEST_RUN_STATE_TEST_GENERATOR } from "@testing/generators/testing/run-state";
import { withTestingTempProductDir } from "@testing/harnesses/testing/harness";

describe("testing last-run state record fidelity", () => {
  it("round-trips every recorded field through write and read", async () => {
    await withTestingTempProductDir(async (productDir) => {
      await fc.assert(
        fc.asyncProperty(TEST_RUN_STATE_TEST_GENERATOR.testRunState(), async (state) => {
          const created = await createTestRunFile(productDir);
          if (!created.ok) throw new Error(created.error);

          const written = await writeTerminalTestRunState(created.value.runFilePath, state);
          if (!written.ok) throw new Error(written.error);

          const runs = await readTestingRuns(productDir);
          if (!runs.ok) throw new Error(runs.error);

          const persisted = runs.value.terminalRuns.find(
            (run) => run.runFileName === created.value.runFileName,
          );
          expect(persisted?.state).toEqual(state);
        }),
        { numRuns: 25 },
      );
    });
  });
});
