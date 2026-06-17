import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  createGithubSnapshotSink,
  SNAPSHOT_RUN_ARTIFACT_PREFIX,
  SNAPSHOT_SURFACE_KIND,
} from "@/lib/github-snapshot-sink";
import {
  arbitraryProjection,
  arbitraryProjectionHistory,
  arbitraryPullNumber,
  arbitraryRunToken,
  arbitrarySnapshotMarker,
} from "@testing/generators/github-snapshot";
import { RecordingGithubSnapshotClient } from "@testing/harnesses/github-snapshot-client";

describe("a snapshot write persists a projection, never an appended event history", () => {
  it("writes each projection to a mutable surface verbatim — not a transformed or accumulated log", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryPullNumber(),
        arbitrarySnapshotMarker(),
        arbitraryProjection(),
        async (pullNumber, marker, rendered) => {
          const client = new RecordingGithubSnapshotClient();
          const sink = createGithubSnapshotSink({
            target: { kind: SNAPSHOT_SURFACE_KIND.PULL_REQUEST_COMMENT, pullNumber, marker },
            client,
          });

          await sink.write(rendered);

          // the surface holds exactly the rendered projection — the sink is a projection sink,
          // it does not wrap, prefix, or append the rendered string to prior content
          expect(client.comments[0]?.body).toBe(rendered);
        },
      ),
    );
  });

  it("leaves a mutable surface holding the latest projection only, never a growing history", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryPullNumber(),
        arbitrarySnapshotMarker(),
        arbitraryProjectionHistory(),
        async (pullNumber, marker, projections) => {
          const client = new RecordingGithubSnapshotClient();
          const sink = createGithubSnapshotSink({
            target: { kind: SNAPSHOT_SURFACE_KIND.PULL_REQUEST_COMMENT, pullNumber, marker },
            client,
          });

          for (const rendered of projections) {
            await sink.write(rendered);
          }

          // re-writing upserts in place: one comment, holding the latest projection —
          // not one comment per write (which would be an appended event history)
          expect(client.comments).toHaveLength(1);
          expect(client.comments[0]?.body).toBe(projections[projections.length - 1]);
        },
      ),
    );
  });

  it("addresses an immutable artifact surface per run so the latest projection is resolvable", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryRunToken(),
        arbitraryRunToken(),
        arbitraryProjection(),
        arbitraryProjection(),
        async (earlierToken, laterToken, earlier, later) => {
          fc.pre(earlierToken !== laterToken);
          const client = new RecordingGithubSnapshotClient();

          await createGithubSnapshotSink({
            target: { kind: SNAPSHOT_SURFACE_KIND.ACTIONS_ARTIFACT, runToken: earlierToken },
            client,
          }).write(earlier);
          await createGithubSnapshotSink({
            target: { kind: SNAPSHOT_SURFACE_KIND.ACTIONS_ARTIFACT, runToken: laterToken },
            client,
          }).write(later);

          expect(client.artifacts).toHaveLength(2);
          expect(new Set(client.artifacts.map((entry) => entry.name)).size).toBe(2);
          expect(client.artifacts.map((entry) => entry.name)).toEqual([
            `${SNAPSHOT_RUN_ARTIFACT_PREFIX}${earlierToken}`,
            `${SNAPSHOT_RUN_ARTIFACT_PREFIX}${laterToken}`,
          ]);
          expect(client.artifacts.map((entry) => entry.body)).toEqual([earlier, later]);
        },
      ),
    );
  });

  it("addresses an immutable cache surface per run so the latest projection is resolvable, never overwriting a key", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryRunToken(),
        arbitraryRunToken(),
        arbitraryProjection(),
        arbitraryProjection(),
        async (earlierToken, laterToken, earlier, later) => {
          fc.pre(earlierToken !== laterToken);
          const client = new RecordingGithubSnapshotClient();

          await createGithubSnapshotSink({
            target: { kind: SNAPSHOT_SURFACE_KIND.ACTIONS_CACHE, runToken: earlierToken },
            client,
          }).write(earlier);
          await createGithubSnapshotSink({
            target: { kind: SNAPSHOT_SURFACE_KIND.ACTIONS_CACHE, runToken: laterToken },
            client,
          }).write(later);

          // each run's projection is saved under its own key — distinct entries, not an
          // overwrite of one key; the per-run keys make the latest run's projection resolvable
          expect(client.caches).toHaveLength(2);
          expect(new Set(client.caches.map((entry) => entry.key)).size).toBe(2);
          expect(client.caches.map((entry) => entry.body)).toEqual([earlier, later]);
        },
      ),
    );
  });
});
