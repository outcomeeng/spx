import { execa } from "execa";

import type { GithubSnapshotClient } from "@/lib/github-snapshot-sink";

export const GITHUB_CLI_ERROR = {
  SURFACE_UNSUPPORTED: "the pull-request comment client supports only the pull-request comment surface",
} as const;

export const GITHUB_CLI = {
  executable: "gh",
  apiCommand: "api",
  fieldFlag: "-f",
  methodFlag: "-X",
  paginateFlag: "--paginate",
  postMethod: "POST",
  patchMethod: "PATCH",
  bodyField: "body",
} as const;

/** Injected boundary that runs one `gh` invocation and returns its standard output. */
export interface GhRunner {
  (args: readonly string[], options?: { readonly input?: string }): Promise<{ readonly stdout: string }>;
}

export interface GithubPrCommentClientOptions {
  /** The `owner/repo` slug the comment lives under. */
  readonly repository: string;
  /** Injected `gh` runner; defaults to the real `gh` executable. */
  readonly run?: GhRunner;
}

interface GithubComment {
  readonly id: number;
  readonly body: string;
}

const defaultGhRunner: GhRunner = async (args, options) => {
  const result = await execa(GITHUB_CLI.executable, [...args], {
    ...(options?.input === undefined ? {} : { input: options.input }),
  });
  return { stdout: typeof result.stdout === "string" ? result.stdout : "" };
};

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
 * comment through the `gh` CLI: it lists the pull request's comments, finds the one
 * carrying the run's marker tag, and edits it in place or creates it when absent. The
 * Actions artifact and cache surfaces are not part of the pull-request comment stream
 * and are rejected.
 */
export function createGithubPrCommentClient(options: GithubPrCommentClientOptions): GithubSnapshotClient {
  const run = options.run ?? defaultGhRunner;
  return {
    async upsertPullRequestComment({ pullNumber, marker, body }): Promise<void> {
      const markedBody = `${body}\n${githubCommentMarkerTag(marker)}`;
      const listed = await run([
        GITHUB_CLI.apiCommand,
        issueCommentsPath(options.repository, pullNumber),
        GITHUB_CLI.paginateFlag,
      ]);
      const comments = JSON.parse(listed.stdout) as readonly GithubComment[];
      const existing = comments.find((comment) => comment.body.includes(githubCommentMarkerTag(marker)));
      if (existing === undefined) {
        await run([
          GITHUB_CLI.apiCommand,
          issueCommentsPath(options.repository, pullNumber),
          GITHUB_CLI.methodFlag,
          GITHUB_CLI.postMethod,
          GITHUB_CLI.fieldFlag,
          `${GITHUB_CLI.bodyField}=${markedBody}`,
        ]);
        return;
      }
      await run([
        GITHUB_CLI.apiCommand,
        issueCommentPath(options.repository, existing.id),
        GITHUB_CLI.methodFlag,
        GITHUB_CLI.patchMethod,
        GITHUB_CLI.fieldFlag,
        `${GITHUB_CLI.bodyField}=${markedBody}`,
      ]);
    },
    uploadActionsArtifact(): Promise<void> {
      return Promise.reject(new Error(GITHUB_CLI_ERROR.SURFACE_UNSUPPORTED));
    },
    saveActionsCache(): Promise<void> {
      return Promise.reject(new Error(GITHUB_CLI_ERROR.SURFACE_UNSUPPORTED));
    },
  };
}
