import type { Config } from "@testing/harnesses/spec-tree/spec-tree";

import { DEFAULT_IGNORE_SOURCE_OVERRIDES, EMPTY_INCLUDED_SET_IGNORE_READER } from "@/lib/file-inclusion/ignore-source";
import type { ScopeResolverConfig, ScopeResolverState } from "@/lib/file-inclusion/pipeline";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import {
  differentPrefixPath,
  distinctUntrackedPaths,
  nestedTrackedPath,
  pathPrefix,
} from "@testing/harnesses/file-inclusion/path-predicates";
import type { GitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

export { PROPERTY_NUM_RUNS } from "@testing/harnesses/spec-tree/generators";

export const integrationConfig: Config = MINIMAL_SPEC_TREE_CONFIG;

export const resolverConfig: ScopeResolverConfig = {};

export const specTreePath = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/17-file-inclusion.enabler/file-inclusion.md`;

export type ScopeResolverFixture = {
  readonly trackedFilePath: string;
  readonly untrackedFilePath: string;
  readonly ignoredFilePath: string;
  readonly domainExcludedPath: string;
  readonly domainExcludePrefix: string;
  readonly domainIncludedPath: string;
  readonly domainIncludePrefix: string;
  readonly domainIncludeMissPath: string;
  readonly ignoredPattern: string;
  readonly fileContent: string;
};

export function scopeResolverFixture(): ScopeResolverFixture {
  const [tracked, domainExcludedPath, domainIncludedPath] = distinctPrefixedTrackedPaths(3);
  const [untrackedPath] = distinctUntrackedPaths(1);
  const ignoredPattern = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.gitignorePattern());
  return {
    trackedFilePath: tracked,
    untrackedFilePath: untrackedPath,
    ignoredFilePath: ignoredPattern,
    domainExcludedPath,
    domainExcludePrefix: pathPrefix(domainExcludedPath),
    domainIncludedPath,
    domainIncludePrefix: pathPrefix(domainIncludedPath),
    domainIncludeMissPath: differentPrefixPath(domainIncludedPath),
    ignoredPattern,
    fileContent: sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.fileContent()),
  };
}

export function distinctPrefixedTrackedPaths(count: number): readonly string[] {
  const paths = new Map<string, string>();
  const maxAttempts = count * 50;
  for (let attempt = 0; attempt < maxAttempts && paths.size < count; attempt += 1) {
    const candidate = nestedTrackedPath();
    paths.set(pathPrefix(candidate), candidate);
  }
  if (paths.size !== count) {
    throw new Error("Unable to generate tracked paths with distinct prefixes");
  }
  return [...paths.values()];
}

export async function writeScopeResolverFixture(
  env: GitWorktreeEnv,
  fixture: ScopeResolverFixture,
): Promise<void> {
  await env.writeTracked(fixture.trackedFilePath, fixture.fileContent);
  await env.writeTracked(fixture.domainExcludedPath, fixture.fileContent);
  await env.writeTracked(fixture.domainIncludedPath, fixture.fileContent);
  await env.writeUntracked(fixture.untrackedFilePath, fixture.fileContent);
  await env.writeUntracked(fixture.domainIncludeMissPath, fixture.fileContent);
  await env.writeGitignore(".", `${fixture.ignoredPattern}\n`);
  await env.writeUntracked(fixture.ignoredFilePath, fixture.fileContent);
}

export function makeResolverState(
  request: ScopeResolverState["request"] = {},
): ScopeResolverState {
  return {
    config: resolverConfig,
    ignoreReader: EMPTY_INCLUDED_SET_IGNORE_READER,
    request: {
      overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
      ...request,
    },
  };
}
