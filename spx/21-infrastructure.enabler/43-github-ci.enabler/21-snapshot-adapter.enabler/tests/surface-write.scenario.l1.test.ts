import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { JOURNAL_BACKEND_KIND } from "@/lib/agent-run-journal";
import {
  createGithubSnapshotSink,
  SNAPSHOT_RUN_ARTIFACT_PREFIX,
  SNAPSHOT_RUN_CACHE_PREFIX,
  SNAPSHOT_SURFACE_KIND,
} from "@/lib/github-snapshot-sink";
import { arbitraryRunToken } from "@testing/generators/github-snapshot";
import { RecordingGithubSnapshotClient } from "@testing/harnesses/github-snapshot-client";

const arbitraryProjection = (): fc.Arbitrary<string> => fc.string();
const arbitraryMarker = (): fc.Arbitrary<string> => fc.string({ minLength: 1 });
const arbitraryPullNumber = (): fc.Arbitrary<number> => fc.integer({ min: 1 });

describe("github snapshot sink publishes a projection to each configured surface", () => {
  it("declares the Snapshot backend kind", () => {
    const client = new RecordingGithubSnapshotClient();
    const sink = createGithubSnapshotSink({
      target: { kind: SNAPSHOT_SURFACE_KIND.ACTIONS_CACHE, runToken: "run" },
      client,
    });

    expect(sink.kind).toBe(JOURNAL_BACKEND_KIND.SNAPSHOT);
  });

  it("upserts the projection as a pull-request comment", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryPullNumber(),
        arbitraryMarker(),
        arbitraryProjection(),
        async (pullNumber, marker, rendered) => {
          const client = new RecordingGithubSnapshotClient();
          const sink = createGithubSnapshotSink({
            target: { kind: SNAPSHOT_SURFACE_KIND.PULL_REQUEST_COMMENT, pullNumber, marker },
            client,
          });

          await sink.write(rendered);

          expect(client.comments).toEqual([{ pullNumber, marker, body: rendered }]);
          expect(client.artifacts).toEqual([]);
          expect(client.caches).toEqual([]);
        },
      ),
    );
  });

  it("uploads the projection as a run-scoped Actions artifact", async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryRunToken(), arbitraryProjection(), async (runToken, rendered) => {
        const client = new RecordingGithubSnapshotClient();
        const sink = createGithubSnapshotSink({
          target: { kind: SNAPSHOT_SURFACE_KIND.ACTIONS_ARTIFACT, runToken },
          client,
        });

        await sink.write(rendered);

        expect(client.artifacts).toHaveLength(1);
        expect(client.artifacts[0]?.body).toBe(rendered);
        // the artifact is addressed per run (prefix + run token) so the latest projection is resolvable
        expect(client.artifacts[0]?.name).toBe(`${SNAPSHOT_RUN_ARTIFACT_PREFIX}${runToken}`);
        expect(client.comments).toEqual([]);
        expect(client.caches).toEqual([]);
      }),
    );
  });

  it("saves the projection under a run-scoped Actions cache key", async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryRunToken(), arbitraryProjection(), async (runToken, rendered) => {
        const client = new RecordingGithubSnapshotClient();
        const sink = createGithubSnapshotSink({
          target: { kind: SNAPSHOT_SURFACE_KIND.ACTIONS_CACHE, runToken },
          client,
        });

        await sink.write(rendered);

        expect(client.caches).toHaveLength(1);
        expect(client.caches[0]?.body).toBe(rendered);
        expect(client.caches[0]?.key).toBe(`${SNAPSHOT_RUN_CACHE_PREFIX}${runToken}`);
        expect(client.comments).toEqual([]);
        expect(client.artifacts).toEqual([]);
      }),
    );
  });
});
