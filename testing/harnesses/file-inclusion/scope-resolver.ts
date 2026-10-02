import { DEFAULT_IGNORE_SOURCE_OVERRIDES, EMPTY_INCLUDED_SET_IGNORE_READER } from "@/lib/file-inclusion/ignore-source";
import type { ScopeResolverConfig, ScopeResolverState } from "@/lib/file-inclusion/pipeline";
import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import {
  differentPrefixPath,
  distinctUntrackedPaths,
  nestedTrackedPath,
  pathPrefix,
} from "@testing/harnesses/file-inclusion/path-predicates";
import type { GitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

export { PROPERTY_NUM_RUNS } from "@testing/harnesses/spec-tree/generators";

export const resolverConfig: ScopeResolverConfig = {};

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

function distinctPrefixedTrackedPaths(count: number): readonly string[] {
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

export type FilterLayerViolationFixture = ScopeResolverFixture & {
  readonly nestedIgnoredPath: string;
  readonly infoExcludedPath: string;
  readonly globalExcludedPath: string;
  readonly ignoreFilePath: string;
  readonly ignoreFileMatchedPath: string;
  readonly submoduleContentPath: string;
};

/**
 * Writes a worktree holding one file per filter-layer exclusion source: a root `.gitignore` match,
 * a nested `.gitignore` match, a `.git/info/exclude` match, a `core.excludesFile` match, a match of a
 * caller-supplied ignore file, the domain include/exclude paths of {@link ScopeResolverFixture}, and a
 * file inside a submodule.
 */
export async function writeFilterLayerViolationFixture(env: GitWorktreeEnv): Promise<FilterLayerViolationFixture> {
  const base = scopeResolverFixture();
  await writeScopeResolverFixture(env, base);
  const [nestedDirectory, submoduleDirectory] = distinctPrefixedTrackedPaths(2).map((path) => pathPrefix(path));
  const [nestedPattern, infoExcludedPath, globalExcludedPath, ignoreFileMatchedPath] = distinctIgnoredPatterns(
    4,
    base.ignoredPattern,
  );
  const [ignoreFilePath] = distinctUntrackedPaths(1);
  const nestedIgnoredPath = `${nestedDirectory}/${nestedPattern}`;
  const submoduleContentPath = `${submoduleDirectory}/${
    sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.trackedFilePath())
  }`;

  await env.writeGitignore(nestedDirectory, `${nestedPattern}\n`);
  await env.writeUntracked(nestedIgnoredPath, base.fileContent);
  await env.writeInfoExclude(`${infoExcludedPath}\n`);
  await env.writeUntracked(infoExcludedPath, base.fileContent);
  await env.configureGlobalExcludes(`${globalExcludedPath}\n`);
  await env.writeUntracked(globalExcludedPath, base.fileContent);
  await env.writeUntracked(ignoreFilePath, `${ignoreFileMatchedPath}\n`);
  await env.writeUntracked(ignoreFileMatchedPath, base.fileContent);
  await env.addSubmodule(submoduleDirectory);
  await env.writeUntracked(submoduleContentPath, base.fileContent);

  return {
    ...base,
    nestedIgnoredPath,
    infoExcludedPath,
    globalExcludedPath,
    ignoreFilePath,
    ignoreFileMatchedPath,
    submoduleContentPath,
  };
}

function distinctIgnoredPatterns(count: number, taken: string): readonly string[] {
  const patterns = new Set<string>();
  const maxAttempts = count * 50;
  for (let attempt = 0; attempt < maxAttempts && patterns.size < count; attempt += 1) {
    const candidate = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.gitignorePattern());
    if (candidate !== taken) patterns.add(candidate);
  }
  if (patterns.size !== count) {
    throw new Error("Unable to generate distinct ignored patterns");
  }
  return [...patterns];
}
