import type { PathFilterConfig } from "@/config/primitives/path-filter";
import { DEFAULT_IGNORE_SOURCE_OVERRIDES, type IgnoreSourceReader } from "@/lib/file-inclusion/ignore-source";
import type { GitTrackingState } from "@/lib/file-inclusion/types";
import * as fc from "fast-check";

import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";

const SAMPLE_ATTEMPTS = 50;
const NESTED_PREFIX_MAX_DEPTH = 2;
const CURRENT_DIRECTORY_PREFIX = ".";

export { PROPERTY_NUM_RUNS } from "@testing/harnesses/spec-tree/generators";

export function samplePath(): string {
  return sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.untrackedFilePath());
}

export function trackedPath(): string {
  return sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.trackedFilePath());
}

export function nestedTrackedPath(): string {
  const [first, second, file] = sampleLiteralTestValue(
    fc.tuple(arbitraryPathSegment(), arbitraryPathSegment(), arbitraryPathSegment()),
  );
  return `${first}/${second}/${file}.ts`;
}

export function sampleLayerName(): string {
  return sampleLiteralTestValue(arbitraryDomainLiteral());
}

export function pathPrefix(path: string): string {
  const segments = path.split("/");
  const prefixDepth = Math.max(1, Math.min(NESTED_PREFIX_MAX_DEPTH, segments.length - 1));
  return segments.slice(0, prefixDepth).join("/");
}

export function differentPrefixPath(referencePath: string): string {
  const referencePrefix = pathPrefix(referencePath);
  for (let attempt = 0; attempt < SAMPLE_ATTEMPTS; attempt += 1) {
    const candidate = samplePath();
    if (pathPrefix(candidate) !== referencePrefix) {
      return candidate;
    }
  }
  throw new Error("Unable to generate a path with a different prefix");
}

export function distinctTrackedPaths(count: number): readonly string[] {
  return distinctGeneratedPaths(count, trackedPath);
}

export function distinctUntrackedPaths(count: number): readonly string[] {
  return distinctGeneratedPaths(count, samplePath);
}

function distinctGeneratedPaths(count: number, generate: () => string): readonly string[] {
  const paths = new Set<string>();
  for (let attempt = 0; attempt < SAMPLE_ATTEMPTS && paths.size < count; attempt += 1) {
    paths.add(generate());
  }
  if (paths.size !== count) {
    throw new Error("Unable to generate distinct file-inclusion paths");
  }
  return [...paths];
}

export function makeReader(includedPaths: readonly string[]): IgnoreSourceReader {
  const included = new Set(includedPaths);
  return {
    isInIncludedSet(relativePath: string): boolean {
      return included.has(relativePath);
    },
    hasIncludedDescendant(relativePath: string): boolean {
      if (included.size > 0 && (relativePath.length === 0 || relativePath === CURRENT_DIRECTORY_PREFIX)) {
        return true;
      }
      const descendantPrefix = relativePath.endsWith("/") ? relativePath : `${relativePath}/`;
      for (const path of included) {
        if (path.startsWith(descendantPrefix)) return true;
      }
      return false;
    },
    appliedOverrides() {
      return DEFAULT_IGNORE_SOURCE_OVERRIDES;
    },
  };
}

export function makeGitTrackingState(includedPaths: readonly string[]): GitTrackingState {
  return { reader: makeReader(includedPaths) };
}

export function pathFilter(config: PathFilterConfig): PathFilterConfig {
  return config;
}
