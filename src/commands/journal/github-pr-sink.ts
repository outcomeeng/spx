import { createGithubSnapshotSink, type GithubSnapshotClient, SNAPSHOT_SURFACE_KIND } from "@/lib/github-snapshot-sink";

import type { JournalStreamSink } from "./runtime";

export interface GithubPrStreamSinkOptions {
  /** Injected GitHub client boundary that upserts the pull-request comment. */
  readonly client: GithubSnapshotClient;
  /** The pull-request number the run streams to. */
  readonly pullNumber: number;
  /** The comment marker that identifies this run's upsertable comment. */
  readonly marker: string;
  /** Renders the run's current projection — the body the pull-request comment shows. */
  readonly renderBody: () => Promise<string>;
}

/**
 * A journal streaming sink for the GitHub pull-request backend: on each appended
 * event it re-renders the run's projection and upserts the pull-request comment
 * through the Snapshot adapter, so the run is observable on the pull request as it
 * advances. The comment shows the full current projection, not one line per event.
 */
export function createGithubPrStreamSink(options: GithubPrStreamSinkOptions): JournalStreamSink {
  const snapshot = createGithubSnapshotSink({
    target: {
      kind: SNAPSHOT_SURFACE_KIND.PULL_REQUEST_COMMENT,
      pullNumber: options.pullNumber,
      marker: options.marker,
    },
    client: options.client,
  });
  return {
    async emit(): Promise<void> {
      await snapshot.write(await options.renderBody());
    },
  };
}
