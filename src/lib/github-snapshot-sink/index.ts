import { JOURNAL_BACKEND_KIND, type SnapshotBackend } from "@/lib/agent-run-journal";

/** The GitHub-native surfaces a run's rendered projection can be published to. */
export const SNAPSHOT_SURFACE_KIND = {
  PULL_REQUEST_COMMENT: "pull-request-comment",
  ACTIONS_ARTIFACT: "actions-artifact",
  ACTIONS_CACHE: "actions-cache",
} as const;

export type SnapshotSurfaceKind = (typeof SNAPSHOT_SURFACE_KIND)[keyof typeof SNAPSHOT_SURFACE_KIND];

/** Resolved GitHub surface target for one rendered projection write. */
export type SnapshotSurfaceTarget =
  | {
    readonly kind: typeof SNAPSHOT_SURFACE_KIND.PULL_REQUEST_COMMENT;
    readonly pullNumber: number;
    readonly marker: string;
  }
  | { readonly kind: typeof SNAPSHOT_SURFACE_KIND.ACTIONS_ARTIFACT; readonly runToken: string }
  | { readonly kind: typeof SNAPSHOT_SURFACE_KIND.ACTIONS_CACHE; readonly runToken: string };

/** Injected client boundary for GitHub and Actions-runtime writes. */
export interface GithubSnapshotClient {
  upsertPullRequestComment(args: { pullNumber: number; marker: string; body: string }): Promise<void>;
  uploadActionsArtifact(args: { name: string; body: string }): Promise<void>;
  saveActionsCache(args: { key: string; body: string }): Promise<void>;
}

export interface GithubSnapshotSinkOptions {
  readonly target: SnapshotSurfaceTarget;
  readonly client: GithubSnapshotClient;
}

/** Run-scoped name and key prefixes that make each run's immutable entry addressable per surface. */
export const SNAPSHOT_RUN_ARTIFACT_PREFIX = "spx-run-artifact-" as const;
export const SNAPSHOT_RUN_CACHE_PREFIX = "spx-run-cache-" as const;

/** Creates a Snapshot backend that writes rendered projections to one GitHub surface. */
export function createGithubSnapshotSink(options: GithubSnapshotSinkOptions): SnapshotBackend {
  const { target, client } = options;
  return {
    kind: JOURNAL_BACKEND_KIND.SNAPSHOT,
    async write(rendered: string): Promise<void> {
      switch (target.kind) {
        case SNAPSHOT_SURFACE_KIND.PULL_REQUEST_COMMENT:
          await client.upsertPullRequestComment({
            pullNumber: target.pullNumber,
            marker: target.marker,
            body: rendered,
          });
          return;
        case SNAPSHOT_SURFACE_KIND.ACTIONS_ARTIFACT:
          await client.uploadActionsArtifact({
            name: `${SNAPSHOT_RUN_ARTIFACT_PREFIX}${target.runToken}`,
            body: rendered,
          });
          return;
        case SNAPSHOT_SURFACE_KIND.ACTIONS_CACHE:
          await client.saveActionsCache({
            key: `${SNAPSHOT_RUN_CACHE_PREFIX}${target.runToken}`,
            body: rendered,
          });
          return;
        default:
          return assertNeverSurface(target);
      }
    },
  };
}

function assertNeverSurface(target: never): never {
  throw new Error(`unhandled snapshot surface target: ${JSON.stringify(target)}`);
}
