import { JOURNAL_BACKEND_KIND, type SnapshotBackend } from "@/lib/agent-run-journal";

/** The GitHub-native surfaces a run's rendered projection can be published to. */
export const SNAPSHOT_SURFACE_KIND = {
  PULL_REQUEST_COMMENT: "pull-request-comment",
  ACTIONS_ARTIFACT: "actions-artifact",
  ACTIONS_CACHE: "actions-cache",
} as const;

export type SnapshotSurfaceKind = (typeof SNAPSHOT_SURFACE_KIND)[keyof typeof SNAPSHOT_SURFACE_KIND];

/**
 * A resolved GitHub surface a run's projection is published to. A pull-request
 * comment is mutable (upserted in place); an Actions artifact and an Actions
 * cache entry are immutable once written, so each is addressed per run.
 */
export type SnapshotSurfaceTarget =
  | {
    readonly kind: typeof SNAPSHOT_SURFACE_KIND.PULL_REQUEST_COMMENT;
    readonly pullNumber: number;
    readonly marker: string;
  }
  | { readonly kind: typeof SNAPSHOT_SURFACE_KIND.ACTIONS_ARTIFACT; readonly runToken: string }
  | { readonly kind: typeof SNAPSHOT_SURFACE_KIND.ACTIONS_CACHE; readonly runToken: string };

/**
 * The injected GitHub client. Every network and Actions-runtime access the sink
 * performs is a call on this interface, so the sink's dispatch verifies over a
 * controlled implementation and the real client binds only at the outermost edge.
 */
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

/**
 * Bind the agent-run journal's `SnapshotBackend` port for one GitHub surface:
 * `write` publishes a rendered projection through the injected client, upserting
 * a mutable pull-request comment in place and addressing an immutable artifact or
 * cache entry per run so the latest projection is resolvable without overwriting.
 */
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
