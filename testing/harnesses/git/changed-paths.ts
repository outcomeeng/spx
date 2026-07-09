import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  changedPathsForCommittedRange,
  changedPathsForDirtyWorktree,
  changedPathsForStagedComparison,
  changedPathsForWorktreeComparison,
  untrackedProductPaths,
} from "@/lib/git/changed-paths";
import { pathsFromNameStatus } from "@/lib/git/name-status";
import { defaultGitDependencies, type GitDependencies } from "@/lib/git/root";
import { arbitraryPathSegment, arbitraryWhitespacePathSegment } from "@testing/generators/git-name/git-name";
import {
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
  readGit,
  runGit,
} from "@testing/harnesses/git-test-constants";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const PRODUCT_DIR = "/product";
const TEMP_DIR_PREFIX = "spx-git-changed-paths-";
const PATH_SEPARATOR = "/";
const SOURCE_ROOT = "src";
const SOURCE_EXTENSION = ".ts";
const COPY_PATH_SUFFIX = "-copy";
const RENAMED_PATH_SUFFIX = "-renamed";
const IGNORED_PATH_SUFFIX = "-ignored";
const BASELINE_CONTENT = "baseline\n";
const MODIFIED_CONTENT = "modified\n";
const UNTRACKED_CONTENT = "untracked\n";
const BASELINE_COMMIT_MESSAGE = "baseline";
const RANGE_COMMIT_MESSAGE = "range change";
const GITIGNORE_FILENAME = ".gitignore";
const TRACKED_ERROR = "tracked failure";
const UNTRACKED_ERROR = "untracked failure";
const GIT_DIFF_COMMAND = "diff";
const GIT_CACHED_FLAG = "--cached";
const GIT_LS_FILES_COMMAND = "ls-files";
const GIT_OTHERS_FLAG = "--others";
const GIT_EXCLUDE_STANDARD_FLAG = "--exclude-standard";
const GIT_NAME_STATUS_FLAG = "--name-status";
const GIT_NULL_DELIMITED_FLAG = "-z";
const GIT_RANGE_SEPARATOR = "..";
const GIT_NULL_RECORD_SEPARATOR = "\0";
const GIT_MODIFY_STATUS_EXAMPLE = "M";
const GIT_RENAME_STATUS_EXAMPLE = "R100";
const GIT_COPY_STATUS_EXAMPLE = "C100";

interface GitScriptEntry {
  readonly stdout: string;
  readonly stderr?: string;
  readonly exitCode?: number;
}

interface ScriptedGit {
  readonly deps: GitDependencies;
}

function productPath(segment: string): string {
  return `${SOURCE_ROOT}${PATH_SEPARATOR}${segment}${SOURCE_EXTENSION}`;
}

function renamedPath(path: string): string {
  return `${path}${RENAMED_PATH_SUFFIX}`;
}

function copiedPath(path: string): string {
  return `${path}${COPY_PATH_SUFFIX}${SOURCE_EXTENSION}`;
}

function ignoredPath(path: string): string {
  return `${path}${IGNORED_PATH_SUFFIX}`;
}

function nulRecord(fields: readonly string[]): string {
  return `${fields.join(GIT_NULL_RECORD_SEPARATOR)}${GIT_NULL_RECORD_SEPARATOR}`;
}

function nameStatusRecord(status: string, paths: readonly string[]): string {
  return nulRecord([status, ...paths]);
}

function createScriptedGit(entries: readonly GitScriptEntry[]): ScriptedGit {
  let index = 0;
  return {
    deps: {
      execa: async (_command, _args, _options) => {
        const entry = entries[index++] ?? { stdout: "", exitCode: 128 };
        return {
          stdout: entry.stdout,
          stderr: entry.stderr ?? "",
          exitCode: entry.exitCode ?? 0,
        };
      },
    },
  };
}

function comparePaths(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function uniqueSorted(paths: readonly string[]): readonly string[] {
  return [...new Set(paths)].sort(comparePaths);
}

function oracleNameStatusPaths(stdout: string): readonly string[] {
  const fields = stdout.split(GIT_NULL_RECORD_SEPARATOR).filter((field) => field.length > 0);
  const paths: string[] = [];
  let index = 0;
  while (index < fields.length) {
    const status = fields[index++] ?? "";
    const pathCount = status.startsWith("R") || status.startsWith("C") ? 2 : 1;
    for (let offset = 0; offset < pathCount; offset += 1) {
      paths.push(fields[index++]);
    }
  }
  return uniqueSorted(paths);
}

function oracleNulPaths(stdout: string): readonly string[] {
  return uniqueSorted(stdout.split(GIT_NULL_RECORD_SEPARATOR).filter((path) => path.length > 0));
}

async function writeProductFile(productDir: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(productDir, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
}

async function commitAll(productDir: string, message: string): Promise<void> {
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.ADD, "."]);
  await runGit(productDir, [
    GIT_TEST_SUBCOMMANDS.COMMIT,
    GIT_TEST_FLAGS.COMMIT_MESSAGE,
    message,
  ]);
}

async function headRef(productDir: string): Promise<string> {
  return readGit(productDir, [GIT_TEST_SUBCOMMANDS.REV_PARSE, "HEAD"]);
}

async function withChangedPathsRepository(
  callback: (productDir: string, trackedPath: string, secondaryPath: string) => Promise<void>,
): Promise<void> {
  await withTempDir(TEMP_DIR_PREFIX, async (productDir) => {
    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
    await runGit(productDir, [
      GIT_TEST_SUBCOMMANDS.CONFIG,
      GIT_TEST_CONFIG.EMAIL_KEY,
      GIT_TEST_CONFIG.EMAIL,
    ]);
    await runGit(productDir, [
      GIT_TEST_SUBCOMMANDS.CONFIG,
      GIT_TEST_CONFIG.USER_NAME_KEY,
      GIT_TEST_CONFIG.USER_NAME,
    ]);
    await callback(productDir, productPath(SOURCE_ROOT), copiedPath(productPath(SOURCE_ROOT)));
  });
}

async function oracleNameStatus(productDir: string, args: readonly string[]): Promise<readonly string[]> {
  return oracleNameStatusPaths(await readGit(productDir, args));
}

async function oracleUntracked(productDir: string): Promise<readonly string[]> {
  return oracleNulPaths(
    await readGit(productDir, [
      GIT_LS_FILES_COMMAND,
      GIT_OTHERS_FLAG,
      GIT_EXCLUDE_STANDARD_FLAG,
      GIT_NULL_DELIMITED_FLAG,
    ]),
  );
}

async function assertCommittedRangeConformance(): Promise<void> {
  await withChangedPathsRepository(async (productDir, trackedPath, secondaryPath) => {
    await writeProductFile(productDir, trackedPath, BASELINE_CONTENT);
    await commitAll(productDir, BASELINE_COMMIT_MESSAGE);
    const base = await headRef(productDir);
    await rename(join(productDir, trackedPath), join(productDir, renamedPath(trackedPath)));
    await commitAll(productDir, RANGE_COMMIT_MESSAGE);
    const head = await headRef(productDir);
    await writeProductFile(productDir, secondaryPath, UNTRACKED_CONTENT);

    await expect(changedPathsForCommittedRange({
      productDir,
      base,
      head,
      git: defaultGitDependencies,
    })).resolves.toEqual(
      await oracleNameStatus(productDir, [
        GIT_DIFF_COMMAND,
        GIT_NAME_STATUS_FLAG,
        GIT_NULL_DELIMITED_FLAG,
        `${base}${GIT_RANGE_SEPARATOR}${head}`,
      ]),
    );
  });
}

async function assertStagedComparisonConformance(): Promise<void> {
  await withChangedPathsRepository(async (productDir, trackedPath, secondaryPath) => {
    await writeProductFile(productDir, trackedPath, BASELINE_CONTENT);
    await commitAll(productDir, BASELINE_COMMIT_MESSAGE);
    const base = await headRef(productDir);
    await writeProductFile(productDir, trackedPath, MODIFIED_CONTENT);
    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.ADD, trackedPath]);
    await writeProductFile(productDir, secondaryPath, UNTRACKED_CONTENT);

    await expect(changedPathsForStagedComparison({
      productDir,
      base,
      git: defaultGitDependencies,
    })).resolves.toEqual(
      await oracleNameStatus(productDir, [
        GIT_DIFF_COMMAND,
        GIT_CACHED_FLAG,
        GIT_NAME_STATUS_FLAG,
        GIT_NULL_DELIMITED_FLAG,
        base,
      ]),
    );
  });
}

async function assertWorktreeComparisonConformance(): Promise<void> {
  await withChangedPathsRepository(async (productDir, trackedPath, secondaryPath) => {
    await writeProductFile(productDir, trackedPath, BASELINE_CONTENT);
    await commitAll(productDir, BASELINE_COMMIT_MESSAGE);
    const base = await headRef(productDir);
    await writeProductFile(productDir, trackedPath, MODIFIED_CONTENT);
    await writeProductFile(productDir, secondaryPath, UNTRACKED_CONTENT);

    await expect(changedPathsForWorktreeComparison({
      productDir,
      base,
      git: defaultGitDependencies,
    })).resolves.toEqual(uniqueSorted([
      ...await oracleNameStatus(productDir, [
        GIT_DIFF_COMMAND,
        GIT_NAME_STATUS_FLAG,
        GIT_NULL_DELIMITED_FLAG,
        base,
      ]),
      ...await oracleUntracked(productDir),
    ]));
  });
}

async function assertDirtyWorktreeConformance(): Promise<void> {
  await withChangedPathsRepository(async (productDir, trackedPath, secondaryPath) => {
    await writeProductFile(productDir, trackedPath, BASELINE_CONTENT);
    await commitAll(productDir, BASELINE_COMMIT_MESSAGE);
    await writeProductFile(productDir, secondaryPath, MODIFIED_CONTENT);
    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.ADD, secondaryPath]);
    await writeProductFile(productDir, trackedPath, MODIFIED_CONTENT);
    await writeProductFile(productDir, renamedPath(secondaryPath), UNTRACKED_CONTENT);

    await expect(changedPathsForDirtyWorktree({
      productDir,
      git: defaultGitDependencies,
    })).resolves.toEqual(uniqueSorted([
      ...await oracleNameStatus(productDir, [
        GIT_DIFF_COMMAND,
        GIT_NAME_STATUS_FLAG,
        GIT_NULL_DELIMITED_FLAG,
      ]),
      ...await oracleUntracked(productDir),
    ]));
  });
}

async function assertUntrackedPathsConformance(): Promise<void> {
  await withChangedPathsRepository(async (productDir, trackedPath, secondaryPath) => {
    const excludedPath = ignoredPath(secondaryPath);
    await writeProductFile(productDir, trackedPath, BASELINE_CONTENT);
    await writeProductFile(productDir, GITIGNORE_FILENAME, `${excludedPath}\n`);
    await commitAll(productDir, BASELINE_COMMIT_MESSAGE);
    await writeProductFile(productDir, secondaryPath, UNTRACKED_CONTENT);
    await writeProductFile(productDir, excludedPath, UNTRACKED_CONTENT);

    await expect(untrackedProductPaths({
      productDir,
      git: defaultGitDependencies,
    })).resolves.toEqual(await oracleUntracked(productDir));
  });
}

export function registerGitUtilityConformanceTests(): void {
  describe("git utility changed-path conformance", () => {
    it("matches git for a committed range", assertCommittedRangeConformance);
    it("matches git for a staged comparison", assertStagedComparisonConformance);
    it("matches git for a worktree comparison", assertWorktreeComparisonConformance);
    it("matches git for a dirty worktree", assertDirtyWorktreeConformance);
    it("matches git for untracked paths", assertUntrackedPathsConformance);

    it("reports tracked dirty-worktree failures with git stderr", async () => {
      await expect(changedPathsForDirtyWorktree({
        productDir: PRODUCT_DIR,
        git: createScriptedGit([{ stdout: "", stderr: TRACKED_ERROR, exitCode: 1 }]).deps,
      })).rejects.toThrow(TRACKED_ERROR);
    });

    it("reports untracked dirty-worktree failures with git stderr", async () => {
      await expect(changedPathsForDirtyWorktree({
        productDir: PRODUCT_DIR,
        git: createScriptedGit([
          { stdout: nameStatusRecord(GIT_MODIFY_STATUS_EXAMPLE, [productPath(SOURCE_ROOT)]) },
          { stdout: "", stderr: UNTRACKED_ERROR, exitCode: 1 },
        ]).deps,
      })).rejects.toThrow(UNTRACKED_ERROR);
    });
  });
}

export function registerGitUtilityPropertyTests(): void {
  describe("git utility name-status properties", () => {
    it("preserves whitespace in NUL-delimited path fields", () => {
      assertProperty(
        arbitraryWhitespacePathSegment(),
        (segment) => {
          const path = productPath(segment);
          expect(pathsFromNameStatus(nameStatusRecord(GIT_MODIFY_STATUS_EXAMPLE, [path]))).toEqual([path]);
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });

    it("includes every path named by rename and copy records", async () => {
      await assertProperty(
        arbitraryPathSegment(),
        (segment) => {
          const path = productPath(segment);
          const renamed = renamedPath(path);
          const copied = copiedPath(path);

          expect(pathsFromNameStatus([
            nameStatusRecord(GIT_RENAME_STATUS_EXAMPLE, [path, renamed]),
            nameStatusRecord(GIT_COPY_STATUS_EXAMPLE, [path, copied]),
          ].join(""))).toEqual([path, copied, renamed]);
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });
}
