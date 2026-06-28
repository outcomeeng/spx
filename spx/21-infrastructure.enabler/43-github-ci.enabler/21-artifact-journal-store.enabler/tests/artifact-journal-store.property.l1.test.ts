import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import { hydratePriorRuns } from "@/lib/artifact-journal-store";
import { arbitraryJournalEventInputs, journalRunFilePath } from "@testing/generators/agent-run-journal";
import { arbitraryPullNumber, arbitraryRunToken } from "@testing/generators/github-snapshot";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import {
  buildSealedRunBody,
  RESTORED_JOURNAL_RUNS_DIR,
  stageRestoredRun,
} from "@testing/harnesses/restored-journal-artifacts";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

describe("artifact journal store — restored run replay", () => {
  it("materializes a restored sealed run whose body replays the identical events in ascending seq order", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryJournalEventInputs(),
        arbitraryRunToken(),
        arbitraryPullNumber(),
        STATE_STORE_TEST_GENERATOR.scopeToken(),
        async (inputs, runToken, pullNumber, type) => {
          // A prior job sealed the run on its now-gone runner filesystem.
          const jobFs = createInMemoryStateStoreFileSystem();
          const { appended, body } = await buildSealedRunBody({
            fs: jobFs,
            runFilePath: journalRunFilePath(runToken),
            runToken,
            inputs,
          });

          // The workflow retained that run file and restored it into a fresh runner's staging directory.
          const freshFs = createInMemoryStateStoreFileSystem();
          await stageRestoredRun({
            fs: freshFs,
            pullNumber,
            type,
            runToken,
            runFilePath: journalRunFilePath(runToken),
            body,
          });

          const [hydratedRun] = await hydratePriorRuns({
            fs: freshFs,
            restoredRunsDir: RESTORED_JOURNAL_RUNS_DIR,
            pullNumber,
            type,
            runFilePathFor: (token) => journalRunFilePath(token),
          });

          const reopened = createAppendableJournalStore({ runFilePath: hydratedRun.runFilePath, fs: freshFs });
          const replayed = await reopened.readAll();

          expect(replayed).toEqual(appended);
          const seqs = replayed.map((event) => event.seq);
          expect(seqs).toEqual([...seqs].sort((left, right) => left - right));
        },
      ),
    );
  });
});
