import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createTestRunDirectory, readTestingBranchRuns, writeTerminalTestRunState } from "@/testing/run-state";
import { TEST_RUN_STATE_TEST_GENERATOR } from "@testing/generators/testing/run-state";
import { withTestingTempProductDir } from "@testing/harnesses/testing/harness";

describe("testing last-run state record fidelity", () => {
  it("round-trips every recorded field through write and read", async () => {
    await withTestingTempProductDir(async (productDir) => {
      await fc.assert(
        fc.asyncProperty(
          TEST_RUN_STATE_TEST_GENERATOR.branchSlug(),
          TEST_RUN_STATE_TEST_GENERATOR.testRunState(),
          async (branchSlug, state) => {
            const stored = { ...state, branchSlug };

            const created = await createTestRunDirectory(productDir, branchSlug);
            if (!created.ok) throw new Error(created.error);

            const written = await writeTerminalTestRunState(created.value.runDir, stored);
            if (!written.ok) throw new Error(written.error);

            const runs = await readTestingBranchRuns(productDir, branchSlug);
            if (!runs.ok) throw new Error(runs.error);

            const persisted = runs.value.terminalRuns.find(
              (run) => run.runDirectoryName === created.value.runDirectoryName,
            );
            expect(persisted?.state).toEqual(stored);
          },
        ),
        { numRuns: 25 },
      );
    });
  });
});
