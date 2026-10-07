import type { ExecResult, GitDependencies } from "@/lib/git/root";

/**
 * A git runner that answers every invocation with `result`, so the tracked-path
 * query can be observed against a chosen `git ls-files` exit and output without a
 * repository (contract probe at the injected git boundary).
 */
export function createGitDependenciesReturning(result: ExecResult): GitDependencies {
  return { execa: () => Promise.resolve(result) };
}

/**
 * A git runner whose every invocation rejects with `cause`, standing in for an
 * unavailable git executable (failure simulation at the injected git boundary).
 */
export function createFailingGitDependencies(cause: Error): GitDependencies {
  return { execa: () => Promise.reject(cause) };
}
