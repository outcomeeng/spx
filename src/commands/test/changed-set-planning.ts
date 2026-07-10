import { CONFIG_FILENAMES } from "@/config/filenames";
import {
  changedPathsForStagedComparison,
  changedPathsForWorktreeComparison,
  GIT_DIFF_CACHED_FLAG,
  GIT_LS_FILES_COMMAND,
  GIT_LS_FILES_EXCLUDE_STANDARD_FLAG,
  GIT_LS_FILES_OTHERS_FLAG,
} from "@/lib/git/changed-paths";
import { GIT_NAME_STATUS_FLAG, GIT_NULL_DELIMITED_FLAG, pathsFromNulDelimited } from "@/lib/git/name-status";
import { GIT_ROOT_COMMAND, type GitDependencies, resolveDefaultBranch, resolveRefSha } from "@/lib/git/root";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { compareAsciiStrings } from "@/lib/state-store";
import type { RelatedTestDependencies } from "@/test/languages/types";
import type { TestingRegistry } from "@/test/registry";

import { mergeChangedSetOperands, partitionChangedPaths, resolveTargetedTestFiles } from "@/domains/test";
import type { TargetSelection } from "@/domains/test/targeting";

import { discoverTestFiles } from "./discovery";

export const CHANGED_TEST_DIFF_COMMAND = "diff";
export const CHANGED_TEST_DIFF_CACHED_FLAG = GIT_DIFF_CACHED_FLAG;
export const CHANGED_TEST_LS_FILES_COMMAND = GIT_LS_FILES_COMMAND;
export const CHANGED_TEST_SHOW_COMMAND = "show";
export const CHANGED_TEST_INDEX_PATH_PREFIX = ":";
export const CHANGED_TEST_DIFF_NAME_STATUS_FLAG = GIT_NAME_STATUS_FLAG;
export const CHANGED_TEST_NULL_DELIMITED_FLAG = GIT_NULL_DELIMITED_FLAG;
export const CHANGED_TEST_LS_FILES_OTHERS_FLAG = GIT_LS_FILES_OTHERS_FLAG;
export const CHANGED_TEST_LS_FILES_EXCLUDE_STANDARD_FLAG = GIT_LS_FILES_EXCLUDE_STANDARD_FLAG;
export const CHANGED_TEST_LS_FILES_CACHED_FLAG = "--cached";
const HEAD_REF = "HEAD";
const ORIGIN_REMOTE = "origin";
const REF_SEPARATOR = "/";
const SPEC_TESTS_PATH_SEGMENT = "/tests/";
const SPEC_ROOT_PREFIX = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${REF_SEPARATOR}`;
const SPEC_ROOT_OPERAND = SPEC_TREE_CONFIG.ROOT_DIRECTORY;
const STAGED_SNAPSHOT_NOT_FOUND_ERROR_CODE = "ENOENT";
const GIT_SHOW_PATH_MISSING_PATTERNS = [
  "exists on disk, but not in",
  "does not exist in",
  "does not exist (neither on disk nor in the index)",
  "not in index",
  "unknown revision or path not in the working tree",
] as const;
export const CHANGED_TEST_PRODUCT_INPUT_DESCRIPTOR_ID = "changed-set-planning";
export const CHANGED_TEST_PRODUCT_INPUT_PATHS = [
  "src/config/filenames.ts",
  "src/config/source-roots.ts",
] as const;
export const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export interface ChangedTestSelectionOptions {
  readonly productDir: string;
  readonly baseRef?: string;
  readonly staged?: boolean;
}

export interface ChangedTestSelection {
  readonly targets: TargetSelection;
  readonly dirtyTargets: TargetSelection;
  readonly fullTreeSelected: boolean;
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

interface StagedSnapshotReadError extends Error {
  readonly code: string;
}

function stagedSnapshotReadError(path: string, stderr: string): StagedSnapshotReadError {
  const error = new Error(
    `failed to read staged test candidate for changed test planning: ${path}: ${stderr}`,
  ) as StagedSnapshotReadError;
  Object.defineProperty(error, "code", {
    value: STAGED_SNAPSHOT_NOT_FOUND_ERROR_CODE,
    enumerable: true,
  });
  return error;
}

export function isStagedSnapshotMissing(stderr: string): boolean {
  return GIT_SHOW_PATH_MISSING_PATTERNS.some((pattern) => stderr.includes(pattern));
}

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
  if (git === undefined) {
    throw new Error("changed test planning requires injected git access");
  }
  if (staged) {
    return await changedPathsForStagedComparison({ productDir, base: baseSha, git });
  }
  return await changedPathsForWorktreeComparison({ productDir, base: baseSha, git });
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
    [CHANGED_TEST_LS_FILES_COMMAND, CHANGED_TEST_LS_FILES_CACHED_FLAG, CHANGED_TEST_NULL_DELIMITED_FLAG],
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
    if (!isStagedSnapshotMissing(result.stderr)) {
      throw new Error(`failed to read staged test candidate for changed test planning: ${path}: ${result.stderr}`);
    }
    throw stagedSnapshotReadError(path, result.stderr);
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

export function changedTestProductInputPaths(registry: TestingRegistry): readonly string[] {
  return [
    ...CHANGED_TEST_PRODUCT_INPUT_PATHS,
    ...Object.values(CONFIG_FILENAMES),
    ...registry.languages.flatMap((language) => language.productInputPaths),
  ].sort(compareAsciiStrings);
}

async function candidateTestPaths(
  options: ChangedTestSelectionOptions,
  git?: GitDependencies,
): Promise<readonly string[]> {
  return options.staged === true
    ? stagedCandidateTestPaths(options.productDir, git)
    : discoverTestFiles(options.productDir);
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
  const partition = partitionChangedPaths(paths, changedTestProductInputPaths(deps.registry));
  const testPaths = !partition.productInputChanged
      && (partition.sourceFiles.length > 0 || partition.operands.length > 0)
    ? await candidateTestPaths(options, deps.git)
    : [];
  const pathSelectedTests = partition.productInputChanged || partition.operands.length === 0
    ? []
    : resolveTargetedTestFiles(testPaths, { operands: partition.operands, recursive: true }).selected;
  const related = partition.productInputChanged || partition.sourceFiles.length === 0
    ? { testPaths: [], unresolved: [] }
    : await relatedTestPaths(partition.sourceFiles, options, baseRef, testPaths, deps);
  const dispatchOperands = mergeChangedSetOperands(pathSelectedTests, related.testPaths);
  const dirtyOperands = partition.operands.length === 0
    ? dispatchOperands
    : mergeChangedSetOperands(partition.operands, related.testPaths);

  return {
    targets: {
      operands: partition.productInputChanged
        ? [SPEC_ROOT_OPERAND]
        : dispatchOperands,
      recursive: partition.productInputChanged,
    },
    dirtyTargets: {
      operands: partition.productInputChanged ? [SPEC_ROOT_OPERAND] : dirtyOperands,
      recursive: partition.productInputChanged || partition.operands.length > 0,
    },
    fullTreeSelected: partition.productInputChanged,
    baseRef,
    baseSha,
    headSha,
    changedPaths: paths,
    unresolvedSourceFiles: related.unresolved,
  };
}
