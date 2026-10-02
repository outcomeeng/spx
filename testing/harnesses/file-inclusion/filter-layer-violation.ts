import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import { distinctUntrackedPaths, pathPrefix } from "@testing/harnesses/file-inclusion/path-predicates";
import {
  distinctPrefixedTrackedPaths,
  type ScopeResolverFixture,
  scopeResolverFixture,
  writeScopeResolverFixture,
} from "@testing/harnesses/file-inclusion/scope-resolver";
import type { GitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

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
