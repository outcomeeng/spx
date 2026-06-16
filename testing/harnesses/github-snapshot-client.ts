import type { GithubSnapshotClient } from "@/lib/github-snapshot-sink";

/**
 * A typed recording double for the injected GitHub client. It implements the
 * real `GithubSnapshotClient` interface, reproduces the pull-request-comment
 * upsert semantics, and records what each surface received so a test reads back
 * the dispatch the sink performed while the real sink code paths execute.
 */
export class RecordingGithubSnapshotClient implements GithubSnapshotClient {
  readonly comments: Array<{ pullNumber: number; marker: string; body: string }> = [];
  readonly artifacts: Array<{ name: string; body: string }> = [];
  readonly caches: Array<{ key: string; body: string }> = [];

  async upsertPullRequestComment(args: { pullNumber: number; marker: string; body: string }): Promise<void> {
    const index = this.comments.findIndex(
      (comment) => comment.pullNumber === args.pullNumber && comment.marker === args.marker,
    );
    if (index >= 0) this.comments[index] = args;
    else this.comments.push(args);
  }

  async uploadActionsArtifact(args: { name: string; body: string }): Promise<void> {
    this.artifacts.push(args);
  }

  async saveActionsCache(args: { key: string; body: string }): Promise<void> {
    this.caches.push(args);
  }
}
