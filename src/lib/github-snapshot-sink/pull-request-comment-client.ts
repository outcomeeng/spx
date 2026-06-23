import type { GithubSnapshotClient } from "./types";

export const GITHUB_API_ERROR = {
  SURFACE_UNSUPPORTED: "the pull-request comment client supports only the pull-request comment surface",
} as const;

export const GITHUB_API = {
  apiCommand: "api",
  fieldFlag: "-f",
  methodFlag: "-X",
  paginateFlag: "--paginate",
  slurpFlag: "--slurp",
  postMethod: "POST",
  patchMethod: "PATCH",
  bodyField: "body",
} as const;

/** Injected boundary that runs one `gh` invocation and returns its standard output. */
export type GithubApiRunner = (
  args: readonly string[],
  options?: { readonly input?: string },
) => Promise<{ readonly stdout: string }>;

export type GithubPullRequestCommentClient = GithubSnapshotClient;

export interface GithubPullRequestCommentClientOptions {
  /** The `owner/repo` slug the comment lives under. */
  readonly repository: string;
  /** Injected GitHub API runner. */
  readonly run: GithubApiRunner;
}

interface GithubComment {
  readonly id: number;
  readonly body: string;
}

/** The hidden HTML-comment tag that makes one run's comment findable for in-place upsert. */
export function githubCommentMarkerTag(marker: string): string {
  return `<!-- ${marker} -->`;
}

function issueCommentsPath(repository: string, pullNumber: number): string {
  return `repos/${repository}/issues/${pullNumber}/comments`;
}

function issueCommentPath(repository: string, commentId: number): string {
  return `repos/${repository}/issues/comments/${commentId}`;
}

/**
 * A {@link GithubSnapshotClient} that upserts a run's projection to one pull-request
 * comment through the injected GitHub API runner: it lists the pull request's comments,
 * finds the one carrying the run's marker tag, and edits it in place or creates it when
 * absent. The Actions artifact and cache surfaces are rejected.
 */
export function createGithubPullRequestCommentClient(
  options: GithubPullRequestCommentClientOptions,
): GithubPullRequestCommentClient {
  const { run } = options;
  return {
    async upsertPullRequestComment({ pullNumber, marker, body }): Promise<void> {
      const markedBody = `${body}\n${githubCommentMarkerTag(marker)}`;
      const listed = await run([
        GITHUB_API.apiCommand,
        issueCommentsPath(options.repository, pullNumber),
        GITHUB_API.paginateFlag,
        GITHUB_API.slurpFlag,
      ]);
      // `--paginate --slurp` wraps each page's comment array in one outer array;
      // flatten the pages so a paginated pull request does not throw before the
      // marker lookup and stop the run's streaming.
      const comments = (JSON.parse(listed.stdout) as readonly (readonly GithubComment[])[]).flat();
      const existing = comments.find((comment) => comment.body.includes(githubCommentMarkerTag(marker)));
      if (existing === undefined) {
        await run([
          GITHUB_API.apiCommand,
          issueCommentsPath(options.repository, pullNumber),
          GITHUB_API.methodFlag,
          GITHUB_API.postMethod,
          GITHUB_API.fieldFlag,
          `${GITHUB_API.bodyField}=${markedBody}`,
        ]);
        return;
      }
      await run([
        GITHUB_API.apiCommand,
        issueCommentPath(options.repository, existing.id),
        GITHUB_API.methodFlag,
        GITHUB_API.patchMethod,
        GITHUB_API.fieldFlag,
        `${GITHUB_API.bodyField}=${markedBody}`,
      ]);
    },
    uploadActionsArtifact(): Promise<void> {
      return Promise.reject(new Error(GITHUB_API_ERROR.SURFACE_UNSUPPORTED));
    },
    saveActionsCache(): Promise<void> {
      return Promise.reject(new Error(GITHUB_API_ERROR.SURFACE_UNSUPPORTED));
    },
  };
}
