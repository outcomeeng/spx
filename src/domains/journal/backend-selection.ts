import type { Result } from "@/config/types";

/**
 * The registered journal backends. `local` persists to a `.spx/` run file and
 * streams to standard output; `github-pr` persists the same run file and streams
 * the rendered projection through the Snapshot adapter to a pull-request comment.
 */
export const JOURNAL_BACKEND = {
  LOCAL: "local",
  GITHUB_PR: "github-pr",
} as const;

export type JournalEdgeBackend = (typeof JOURNAL_BACKEND)[keyof typeof JOURNAL_BACKEND];

export const JOURNAL_BACKEND_ORDER: readonly JournalEdgeBackend[] = [
  JOURNAL_BACKEND.LOCAL,
  JOURNAL_BACKEND.GITHUB_PR,
];

export const JOURNAL_BACKEND_ERROR = {
  UNKNOWN_BACKEND: "unknown journal backend",
} as const;

/**
 * A pure snapshot of the parts of the process environment that decide which
 * journal backend binds. The command layer reads `process.env` into this shape;
 * the domain never reads the environment itself.
 */
export interface JournalEnvironment {
  /** The `SPX_VERIFY_BACKEND` override, when set. */
  readonly backendOverride?: string;
  /** Whether the run executes under continuous integration. */
  readonly continuousIntegration: boolean;
  /** Whether the continuous-integration run targets a GitHub pull request. */
  readonly githubPullRequest: boolean;
}

/** Whether `value` names a registered journal backend. */
export function isJournalEdgeBackend(value: string): value is JournalEdgeBackend {
  return (JOURNAL_BACKEND_ORDER as readonly string[]).includes(value);
}

/**
 * Resolve the bound journal backend from an environment snapshot. An explicit
 * `backendOverride` wins when it names a registered backend and is rejected
 * otherwise; absent an override, a continuous-integration GitHub pull request
 * binds `github-pr` and every other environment binds `local`.
 */
export function resolveJournalBackend(env: JournalEnvironment): Result<JournalEdgeBackend> {
  if (env.backendOverride !== undefined) {
    if (!isJournalEdgeBackend(env.backendOverride)) {
      return {
        ok: false,
        error: `${JOURNAL_BACKEND_ERROR.UNKNOWN_BACKEND}: ${env.backendOverride} (registered: ${
          JOURNAL_BACKEND_ORDER.join(", ")
        })`,
      };
    }
    return { ok: true, value: env.backendOverride };
  }
  if (env.continuousIntegration && env.githubPullRequest) {
    return { ok: true, value: JOURNAL_BACKEND.GITHUB_PR };
  }
  return { ok: true, value: JOURNAL_BACKEND.LOCAL };
}
