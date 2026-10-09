import type { ExecResult, GitDependencies } from "@/lib/git/root";

/** One invocation the observing git runner received: the executable, its argument vector, and its working directory. */
export type GitInvocation = {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string | undefined;
};

/**
 * A git runner that answers every invocation with `result` and records each
 * invocation's executable, arguments, and working directory, so a test observes
 * both the command the tracked-path query ran and the set it derived from a chosen
 * `git ls-files` exit and output, without a repository (spy at the injected git
 * boundary).
 */
export function createObservingGitDependencies(result: ExecResult): {
  readonly deps: GitDependencies;
  readonly invocations: readonly GitInvocation[];
} {
  const invocations: GitInvocation[] = [];
  return {
    deps: {
      execa: (executable, args, options) => {
        invocations.push({ executable, args: [...args], cwd: options?.cwd });
        return Promise.resolve(result);
      },
    },
    invocations,
  };
}

/**
 * A git runner whose every invocation rejects with `cause`, standing in for an
 * unavailable git executable (failure simulation at the injected git boundary).
 */
export function createFailingGitDependencies(cause: Error): GitDependencies {
  return { execa: () => Promise.reject(cause) };
}
