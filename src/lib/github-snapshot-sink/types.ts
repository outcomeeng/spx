/** Injected client boundary for GitHub and Actions-runtime writes. */
export interface GithubSnapshotClient {
  upsertPullRequestComment(args: { pullNumber: number; marker: string; body: string }): Promise<void>;
  uploadActionsArtifact(args: { name: string; body: string }): Promise<void>;
  saveActionsCache(args: { key: string; body: string }): Promise<void>;
}
