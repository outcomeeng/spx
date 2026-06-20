import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createGithubPrStreamSink } from "@/commands/journal/github-pr-sink";
import { arbitraryJournalEvent } from "@testing/generators/agent-run-journal";
import {
  arbitraryProjectionHistory,
  arbitraryPullNumber,
  arbitrarySnapshotMarker,
} from "@testing/generators/github-snapshot";
import { RecordingGithubSnapshotClient } from "@testing/harnesses/github-snapshot-client";

describe("github pull-request stream sink", () => {
  it("upserts the run's current projection to one pull-request comment on each emit", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryPullNumber(),
        arbitrarySnapshotMarker(),
        arbitraryProjectionHistory().filter((history) => history.length >= 1),
        arbitraryJournalEvent(),
        async (pullNumber, marker, bodies, event) => {
          const client = new RecordingGithubSnapshotClient();
          let cursor = 0;
          const sink = createGithubPrStreamSink({
            client,
            pullNumber,
            marker,
            renderBody: () => Promise.resolve(bodies[Math.min(cursor++, bodies.length - 1)] ?? ""),
          });

          for (let index = 0; index < bodies.length; index += 1) {
            await sink.emit(event);
          }

          // Upserted in place: one comment for the run, showing the latest projection.
          expect(client.comments).toHaveLength(1);
          expect(client.comments[0]).toEqual({ pullNumber, marker, body: bodies.at(-1) });
        },
      ),
    );
  });
});
