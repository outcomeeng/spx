import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createJournal, type JournalEvent } from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import { createArtifactJournalStore, hydratePriorRuns } from "@/lib/artifact-journal-store";
import { arbitraryJournalEventInputs, journalRunFilePath } from "@testing/generators/agent-run-journal";
import { arbitraryPullNumber, arbitraryRunToken } from "@testing/generators/github-snapshot";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { InMemoryActionsArtifactClient } from "@testing/harnesses/actions-artifact-client";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

describe("artifact journal store — durable artifact replay", () => {
  it("retains a sealed run as an artifact whose body replays the identical events in ascending seq order", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryJournalEventInputs(),
        arbitraryRunToken(),
        arbitraryPullNumber(),
        STATE_STORE_TEST_GENERATOR.scopeToken(),
        async (inputs, runToken, pullNumber, type) => {
          const artifactClient = new InMemoryActionsArtifactClient();
          const jobFs = createInMemoryStateStoreFileSystem();
          const identity = { streamid: runToken, runid: runToken };
          const journal = createJournal(
            createArtifactJournalStore({
              runFilePath: journalRunFilePath(runToken),
              fs: jobFs,
              artifactClient,
              pullNumber,
              type,
              runToken,
            }),
            identity,
          );

          const appended: JournalEvent[] = [];
          for (const input of inputs) appended.push(await journal.append(input));
          await journal.seal();

          // Re-read through a fresh runner: the artifact body is the run's durable record.
          const freshFs = createInMemoryStateStoreFileSystem();
          const [hydratedRun] = await hydratePriorRuns({
            artifactClient,
            fs: freshFs,
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
