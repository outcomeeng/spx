import { GIT_ROOT_COMMAND, type GitDependencies, resolveDefaultBranch, resolveRefSha } from "@/git/root";
import {
  GIT_NAME_STATUS_FLAG,
  GIT_NULL_DELIMITED_FLAG,
  pathsFromNameStatus,
  pathsFromNulDelimited,
} from "@/lib/git/name-status";
import { compareAsciiStrings } from "@/lib/state-store";
import type { RelatedTestDependencies } from "@/test/languages/types";
import type { TestingRegistry } from "@/test/registry";

import { mergeChangedSetOperands, partitionChangedPaths } from "@/domains/test/changed-set-planning";
import type { TargetSelection } from "@/domains/test/targeting";

import { discoverTestFiles } from "./discovery";

export const CHANGED_TEST_DIFF_COMMAND = "diff";
export const CHANGED_TEST_DIFF_CACHED_FLAG = "--cached";
export const CHANGED_TEST_LS_FILES_COMMAND = "ls-files";
export const CHANGED_TEST_SHOW_COMMAND = "show";
export const CHANGED_TEST_INDEX_PATH_PREFIX = ":";
export const CHANGED_TEST_DIFF_NAME_STATUS_FLAG = GIT_NAME_STATUS_FLAG;
export const CHANGED_TEST_NULL_DELIMITED_FLAG = GIT_NULL_DELIMITED_FLAG;
export const CHANGED_TEST_LS_FILES_OTHERS_FLAG = "--others";
export const CHANGED_TEST_LS_FILES_EXCLUDE_STANDARD_FLAG = "--exclude-standard";
const LS_FILES_CACHED_FLAG = "--cached";
const HEAD_REF = "HEAD";
const ORIGIN_REMOTE = "origin";
const REF_SEPARATOR = "/";
const SPEC_TESTS_PATH_SEGMENT = "/tests/";
const SPEC_ROOT_PREFIX = "spx/";
const SPEC_ROOT_OPERAND = "spx";
export const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export interface ChangedTestSelectionOptions {
  readonly productDir: string;
  readonly baseRef?: string;
  readonly staged?: boolean;
}

export interface ChangedTestSelection {
  readonly targets: TargetSelection;
  readonly baseRef: string;
  readonly baseSha: string;
  readonly headSha: string;
  readonly changedPaths: readonly string[];
  readonly unresolvedSourceFiles: readonly string[];
}

export interface ChangedTestSelectionDependencies {
  readonly git?: GitDependencies;
  readonly registry: TestingRegistry;
  readonly relatedDepsFor: (languageName: string) => RelatedTestDependencies;
}

export const changedPathsFromNameStatus = pathsFromNameStatus;

async function defaultBaseRef(productDir: string, git?: GitDependencies): Promise<string> {
  const branch = await resolveDefaultBranch(productDir, git);
  if (branch === null) {
    throw new Error("failed to resolve default branch for changed test planning");
  }
  return `${ORIGIN_REMOTE}${REF_SEPARATOR}${branch}`;
}

async function requiredRefSha(ref: string, productDir: string, git?: GitDependencies): Promise<string> {
  const sha = await resolveRefSha(ref, productDir, git);
  if (sha === null) {
    if (ref === HEAD_REF) return EMPTY_TREE_SHA;
    throw new Error(`failed to resolve git ref for changed test planning: ${ref}`);
  }
  return sha;
}

async function changedPaths(
  productDir: string,
  baseSha: string,
  staged: boolean,
  git?: GitDependencies,
): Promise<readonly string[]> {
  const runner = git?.execa;
  if (runner === undefined) {
    throw new Error("changed test planning requires injected git access");
  }
  const result = await runner(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [
      CHANGED_TEST_DIFF_COMMAND,
      ...(staged
        ? [CHANGED_TEST_DIFF_CACHED_FLAG, CHANGED_TEST_DIFF_NAME_STATUS_FLAG, CHANGED_TEST_NULL_DELIMITED_FLAG]
        : [CHANGED_TEST_DIFF_NAME_STATUS_FLAG, CHANGED_TEST_NULL_DELIMITED_FLAG]),
      baseSha,
    ],
    { cwd: productDir, reject: false },
  );
  if (result.exitCode !== 0) {
    throw new Error(`failed to diff changed paths for test planning: ${result.stderr}`);
  }
  const diffPaths = changedPathsFromNameStatus(result.stdout);
  if (staged) {
    return diffPaths;
  }
  const untrackedPaths = await untrackedWorktreePaths(productDir, git);
  return [...new Set([...diffPaths, ...untrackedPaths])].sort(compareAsciiStrings);
}

async function untrackedWorktreePaths(productDir: string, git?: GitDependencies): Promise<readonly string[]> {
  const runner = git?.execa;
  if (runner === undefined) {
    throw new Error("changed test planning requires injected git access");
  }
  const result = await runner(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [
      CHANGED_TEST_LS_FILES_COMMAND,
      CHANGED_TEST_LS_FILES_OTHERS_FLAG,
      CHANGED_TEST_LS_FILES_EXCLUDE_STANDARD_FLAG,
      CHANGED_TEST_NULL_DELIMITED_FLAG,
    ],
    { cwd: productDir, reject: false },
  );
  if (result.exitCode !== 0) {
    throw new Error(`failed to list untracked paths for changed test planning: ${result.stderr}`);
  }
  return pathsFromNulDelimited(result.stdout);
}

function isSpecTestPath(path: string): boolean {
  return path.startsWith(SPEC_ROOT_PREFIX) && path.includes(SPEC_TESTS_PATH_SEGMENT);
}

async function stagedCandidateTestPaths(productDir: string, git?: GitDependencies): Promise<readonly string[]> {
  const runner = git?.execa;
  if (runner === undefined) {
    throw new Error("staged changed test planning requires injected git access");
  }
  const result = await runner(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [CHANGED_TEST_LS_FILES_COMMAND, LS_FILES_CACHED_FLAG, CHANGED_TEST_NULL_DELIMITED_FLAG],
    { cwd: productDir, reject: false },
  );
  if (result.exitCode !== 0) {
    throw new Error(`failed to list staged test candidates for changed test planning: ${result.stderr}`);
  }
  return pathsFromNulDelimited(result.stdout).filter(isSpecTestPath);
}

async function readStagedFile(productDir: string, path: string, git?: GitDependencies): Promise<string> {
  const runner = git?.execa;
  if (runner === undefined) {
    throw new Error("staged related-test resolution requires injected git access");
  }
  const result = await runner(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [CHANGED_TEST_SHOW_COMMAND, `${CHANGED_TEST_INDEX_PATH_PREFIX}${path}`],
    { cwd: productDir, reject: false },
  );
  if (result.exitCode !== 0) {
    throw new Error(`failed to read staged test candidate for changed test planning: ${path}: ${result.stderr}`);
  }
  return result.stdout;
}

async function relatedTestPaths(
  sourceFiles: readonly string[],
  options: ChangedTestSelectionOptions,
  baseRef: string,
  candidateTestPaths: readonly string[],
  deps: ChangedTestSelectionDependencies,
): Promise<{ readonly testPaths: readonly string[]; readonly unresolved: readonly string[] }> {
  const testPaths: string[] = [];
  const resolved = new Set<string>();

  for (const language of deps.registry.languages) {
    if (language.relatedTestPaths === undefined) continue;
    const relatedDeps = deps.relatedDepsFor(language.name);
    const languageResolution = await language.relatedTestPaths(
      { projectRoot: options.productDir, sourcePaths: sourceFiles, candidateTestPaths, baseRef },
      options.staged === true
        ? { ...relatedDeps, readFile: (path) => readStagedFile(options.productDir, path, deps.git) }
        : relatedDeps,
    );
    if (languageResolution.testPaths.length > 0) {
      for (const sourceFile of languageResolution.resolvedSourcePaths) resolved.add(sourceFile);
      testPaths.push(...languageResolution.testPaths);
    }
  }

  return {
    testPaths: [...new Set(testPaths)].sort(compareAsciiStrings),
    unresolved: sourceFiles.filter((sourceFile) => !resolved.has(sourceFile)),
  };
}

/** Resolves the changed-set operand source consumed by targeted execution. */
export async function planChangedTestSelection(
  options: ChangedTestSelectionOptions,
  deps: ChangedTestSelectionDependencies,
): Promise<ChangedTestSelection> {
  const baseRef = options.baseRef ?? await defaultBaseRef(options.productDir, deps.git);
  const [baseSha, headSha] = await Promise.all([
    requiredRefSha(baseRef, options.productDir, deps.git),
    requiredRefSha(HEAD_REF, options.productDir, deps.git),
  ]);
  const paths = await changedPaths(options.productDir, baseSha, options.staged === true, deps.git);
  const partition = partitionChangedPaths(paths);
  let candidateTestPaths: readonly string[] = [];
  if (partition.sourceFiles.length > 0) {
    candidateTestPaths = options.staged === true
      ? await stagedCandidateTestPaths(options.productDir, deps.git)
      : await discoverTestFiles(options.productDir);
  }
  const related = partition.sourceFiles.length === 0
    ? { testPaths: [], unresolved: [] }
    : await relatedTestPaths(partition.sourceFiles, options, baseRef, candidateTestPaths, deps);

  return {
    targets: {
      operands: partition.configChanged
        ? [SPEC_ROOT_OPERAND]
        : mergeChangedSetOperands(partition.operands, related.testPaths),
      recursive: partition.configChanged,
    },
    baseRef,
    baseSha,
    headSha,
    changedPaths: paths,
    unresolvedSourceFiles: related.unresolved,
  };
}
