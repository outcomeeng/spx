import * as fc from "fast-check";

const PATH_SEGMENT_PATTERN = /^[a-z][a-z0-9-]{2,12}$/;
const FILE_CONTENT_MIN_LENGTH = 8;
const FILE_CONTENT_MAX_LENGTH = 64;
const NESTED_DEPTH_MIN = 1;
const NESTED_DEPTH_MAX = 2;
const SUBMODULE_DEPTH_MIN = 1;
const SUBMODULE_DEPTH_MAX = 2;

export const GIT_WORKTREE_TEST_GENERATOR = {
  trackedFilePath: arbitraryTrackedFilePath,
  untrackedFilePath: arbitraryUntrackedFilePath,
  nestedDirectory: arbitraryNestedDirectory,
  submodulePath: arbitrarySubmodulePath,
  fileContent: arbitraryFileContent,
  gitignorePattern: arbitraryGitignorePattern,
  bogusGitDir: arbitraryBogusGitDir,
} as const;

export function sampleGitWorktreeTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1 });
  if (value === undefined) {
    throw new Error("Git-worktree test generator returned no sample");
  }
  return value;
}

function arbitraryPathSegment(): fc.Arbitrary<string> {
  return fc.stringMatching(PATH_SEGMENT_PATTERN);
}

function arbitraryTrackedFilePath(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitraryPathSegment(), arbitraryPathSegment())
    .map(([directory, slug]) => `${directory}/${slug}.ts`);
}

function arbitraryUntrackedFilePath(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitraryPathSegment(), arbitraryPathSegment())
    .map(([directory, slug]) => `${directory}/${slug}.txt`);
}

function arbitraryNestedDirectory(): fc.Arbitrary<string> {
  return fc
    .array(arbitraryPathSegment(), { minLength: NESTED_DEPTH_MIN, maxLength: NESTED_DEPTH_MAX })
    .map((segments) => segments.join("/"));
}

function arbitrarySubmodulePath(): fc.Arbitrary<string> {
  return fc
    .array(arbitraryPathSegment(), { minLength: SUBMODULE_DEPTH_MIN, maxLength: SUBMODULE_DEPTH_MAX })
    .map((segments) => segments.join("/"));
}

function arbitraryFileContent(): fc.Arbitrary<string> {
  return fc
    .string({ minLength: FILE_CONTENT_MIN_LENGTH, maxLength: FILE_CONTENT_MAX_LENGTH })
    .map((body) => `${body}\n`);
}

function arbitraryGitignorePattern(): fc.Arbitrary<string> {
  return arbitraryPathSegment().map((slug) => `${slug}.ignored`);
}

function arbitraryBogusGitDir(): fc.Arbitrary<string> {
  return arbitraryPathSegment().map((slug) => `/nonexistent-${slug}-from-test`);
}
