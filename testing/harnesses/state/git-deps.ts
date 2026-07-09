import { type GitDependencies } from "@/lib/git/root";

/** One scripted git command result for {@link createScriptedGitDeps}. */
export interface ScriptedGitResponse {
  readonly stdout: string;
  readonly exitCode: number;
}

/** Failure modes {@link createFailingGitDeps} simulates. */
export const STATE_GIT_FAILURE_MODE = {
  /** Every git command exits non-zero — the working directory is outside a repository. */
  NON_GIT: "non-git",
  /** The git invocation rejects — binary missing or permission error — exercising the catch path. */
  GIT_ERROR: "git-error",
} as const;

export type StateGitFailureMode = (typeof STATE_GIT_FAILURE_MODE)[keyof typeof STATE_GIT_FAILURE_MODE];

/** Diagnostic carried by the rejection a `git-error` double raises. */
export const STATE_GIT_ERROR_MESSAGE = "state git harness: simulated git invocation failure";

const NON_GIT_EXIT_CODE = 128;

/**
 * A `GitDependencies` double that returns each scripted response in call order,
 * supplying controlled git command outputs to the pure resolution logic under
 * test without constructing a repository per case. Exhausting the script yields
 * a non-zero exit.
 */
export function createScriptedGitDeps(responses: readonly ScriptedGitResponse[]): GitDependencies {
  let callIndex = 0;
  return {
    execa: async () => {
      const response = responses[callIndex++] ?? { stdout: "", exitCode: NON_GIT_EXIT_CODE };
      return {
        stdout: response.exitCode === 0 ? response.stdout : "",
        stderr: "",
        exitCode: response.exitCode,
      };
    },
  };
}

/**
 * A `GitDependencies` double simulating a failure mode: `non-git` exits non-zero
 * for every command, and `git-error` rejects the invocation — driving a resolver
 * under test to its fallback and catch paths respectively.
 */
export function createFailingGitDeps(mode: StateGitFailureMode): GitDependencies {
  return {
    execa: async () => {
      if (mode === STATE_GIT_FAILURE_MODE.GIT_ERROR) {
        throw new Error(STATE_GIT_ERROR_MESSAGE);
      }
      return { stdout: "", stderr: "", exitCode: NON_GIT_EXIT_CODE };
    },
  };
}
