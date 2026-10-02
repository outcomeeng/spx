import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { IgnoreSourceReaderConfig } from "@/lib/file-inclusion/ignore-source";
import {
  CORE_EXCLUDES_FILE_CONFIG_KEY,
  DEFAULT_IGNORE_SOURCE_OVERRIDES,
  GIT_DEFAULT_GLOBAL_IGNORE_PATH,
  GIT_GLOBAL_EXCLUDES_ENV_KEYS,
  GIT_SCOPE_DEFAULT_NODE_MAX_BUFFER_BYTES,
} from "@/lib/file-inclusion/ignore-source";
import type { IgnoreSourceOverrides } from "@/lib/file-inclusion/types";

import {
  GLOBAL_EXCLUDES_CONFIGURATION_FORM,
  type GlobalExcludesConfigurationForm,
  ignoreSourceEntryPath,
  type IgnoreSourceOverrideCase,
  type IgnoreSourceWorktreeState,
  WORKTREE_ENTRY_IGNORE_SOURCE,
} from "@testing/generators/file-inclusion/ignore-source";
import { arbitraryBranchName, arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { type GitWorktreeEnv, INFO_EXCLUDE_RELATIVE_PATH } from "@testing/harnesses/git-worktree/git-worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

export { PROPERTY_NUM_RUNS } from "@testing/harnesses/spec-tree/generators";

const LARGE_SCOPE_DIRECTORY = "bulk-scope";
const LARGE_SCOPE_EXTENSION = ".txt";
const LARGE_SCOPE_FILENAME_STEM_CHARACTER = "x";
const LARGE_SCOPE_FILENAME_STEM_LENGTH = 220;
const LARGE_SCOPE_INDEX_WIDTH = 5;
const LARGE_SCOPE_OUTPUT_MARGIN_BYTES = 1;
const LARGE_SCOPE_BATCH_SIZE = 64;
const LARGE_SCOPE_SAMPLE_INDEX = 0;
const LARGE_SCOPE_FILENAME_STEM = LARGE_SCOPE_FILENAME_STEM_CHARACTER.repeat(LARGE_SCOPE_FILENAME_STEM_LENGTH);
const LINKED_WORKTREE_TEMP_PREFIX = "spx-ignore-source-linked-";
const NON_GIT_DIRECTORY_TEMP_PREFIX = "spx-ignore-source-non-git-";
const GLOBAL_EXCLUDES_HOME_TEMP_PREFIX = "spx-ignore-source-home-";
const RELOCATED_WORKTREE_TEMP_PREFIX = "spx-ignore-source-relocated-";
const RELOCATED_WORKTREE_DIRECTORY = "worktree";
const TOP_LEVEL_DIRECTORY = ".";
const GIT_HOME_PATH_PREFIX = "~/";
const EMPTY_CONFIG_VALUE = "";
const EMPTY_FILE_CONTENT = "";
const LINE_TERMINATOR = "\n";
const ANCHORED_PATTERN_PREFIX = "/";
const NON_VCS_EXCLUDE_SOURCE_NAME_COUNT = 5;

export function readerConfig(
  overrides: IgnoreSourceReaderConfig["overrides"] = DEFAULT_IGNORE_SOURCE_OVERRIDES,
): IgnoreSourceReaderConfig {
  return { overrides };
}

export function trackedFilePath(): string {
  return sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.trackedFilePath());
}

export function untrackedFilePath(): string {
  return sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.untrackedFilePath());
}

export function ignoredPattern(): string {
  return sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.gitignorePattern());
}

export function fileContent(): string {
  return sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.fileContent());
}

export function submodulePath(): string {
  return sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.submodulePath());
}

export function bogusGitDir(): string {
  return sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.bogusGitDir());
}

export async function writeScopeLargerThanDefaultBuffer(root: string): Promise<string> {
  const count = largeScopeFileCount();
  for (let start = 0; start < count; start += LARGE_SCOPE_BATCH_SIZE) {
    const end = Math.min(start + LARGE_SCOPE_BATCH_SIZE, count);
    await Promise.all(
      Array.from({ length: end - start }, async (_unused, offset) => {
        await writeUnderDirectory(root, largeScopePath(start + offset), fileContent());
      }),
    );
  }
  return largeScopePath(LARGE_SCOPE_SAMPLE_INDEX);
}

function largeScopePath(index: number): string {
  return [
    LARGE_SCOPE_DIRECTORY,
    `${String(index).padStart(LARGE_SCOPE_INDEX_WIDTH, "0")}-${LARGE_SCOPE_FILENAME_STEM}${LARGE_SCOPE_EXTENSION}`,
  ].join("/");
}

function largeScopeFileCount(): number {
  return Math.ceil(
    (GIT_SCOPE_DEFAULT_NODE_MAX_BUFFER_BYTES + LARGE_SCOPE_OUTPUT_MARGIN_BYTES) / (largeScopePath(0).length + 1),
  );
}

async function writeUnderDirectory(root: string, relativePath: string, content: string): Promise<void> {
  const target = join(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

/** A linked worktree of the harness repository, with a writer for untracked files inside it. */
export type LinkedWorktree = {
  readonly productDir: string;
  writeUntracked(relativePath: string, content: string): Promise<void>;
};

/**
 * Commits a tracked file in the harness repository, adds a linked worktree on a new branch
 * under a fresh temp directory, and passes it to the callback; the directory is removed after.
 */
export async function withLinkedWorktree(
  env: GitWorktreeEnv,
  callback: (linked: LinkedWorktree) => Promise<void>,
): Promise<void> {
  await env.writeTracked(trackedFilePath(), fileContent());
  await env.commit(sampleGitWorktreeTestValue(arbitraryPathSegment()));
  await withTempDir(LINKED_WORKTREE_TEMP_PREFIX, async (linkedDir) => {
    await env.runGit([
      GIT_TEST_SUBCOMMANDS.WORKTREE,
      GIT_TEST_SUBCOMMANDS.ADD,
      GIT_TEST_FLAGS.NEW_BRANCH,
      sampleGitWorktreeTestValue(arbitraryBranchName()),
      linkedDir,
    ]);
    await callback({
      productDir: linkedDir,
      writeUntracked: async (relativePath, content) => {
        await writeUnderDirectory(linkedDir, relativePath, content);
      },
    });
  });
}

/** Passes an existing, empty directory outside every git working tree to the callback. */
export async function withNonGitDirectory(callback: (directory: string) => Promise<void>): Promise<void> {
  await withTempDir(NON_GIT_DIRECTORY_TEMP_PREFIX, callback);
}

/** Sets `core.excludesFile` in the harness repository's local config to the supplied value. */
export async function configureCoreExcludesFile(env: GitWorktreeEnv, value: string): Promise<void> {
  await env.runGit([GIT_TEST_SUBCOMMANDS.CONFIG, CORE_EXCLUDES_FILE_CONFIG_KEY, value]);
}

/** Overrides for one override case; a present ignore file is written empty at an absolute path under the product directory. */
export async function ignoreSourceOverridesFor(
  env: GitWorktreeEnv,
  overrideCase: IgnoreSourceOverrideCase,
): Promise<IgnoreSourceOverrides> {
  if (!overrideCase.ignoreFilePresent) {
    return { noIgnore: overrideCase.noIgnore, noIgnoreVcs: overrideCase.noIgnoreVcs, ignoreFile: undefined };
  }
  const ignoreFile = ignoredPattern();
  await env.writeUntracked(ignoreFile, EMPTY_FILE_CONTENT);
  return {
    noIgnore: overrideCase.noIgnore,
    noIgnoreVcs: overrideCase.noIgnoreVcs,
    ignoreFile: join(env.productDir, ignoreFile),
  };
}

/** Untracked entries listed in each git ignore source and the non-VCS exclude files the harness wrote. */
export type NonVcsExcludeSources = {
  readonly gitignoredPath: string;
  readonly infoExcludedPath: string;
  readonly globalExcludedPath: string;
  readonly infoExcludeFile: string;
  readonly globalExcludesFile: string;
};

/**
 * Writes three untracked entries listed respectively in the top-level `.gitignore`,
 * `.git/info/exclude`, and a global excludes file placed and configured in the supplied
 * Git path form, under a temporary `HOME` (and `XDG_CONFIG_HOME` for the XDG form) that
 * replaces the process environment for the callback's duration.
 */
export async function withNonVcsExcludeSources(
  env: GitWorktreeEnv,
  form: GlobalExcludesConfigurationForm,
  callback: (sources: NonVcsExcludeSources) => Promise<void>,
): Promise<void> {
  const [gitignoredPath, infoExcludedPath, globalExcludedPath, globalFileName, xdgDirectoryName] = distinctNames(
    NON_VCS_EXCLUDE_SOURCE_NAME_COUNT,
  );
  await env.writeUntracked(gitignoredPath, fileContent());
  await env.writeUntracked(infoExcludedPath, fileContent());
  await env.writeUntracked(globalExcludedPath, fileContent());
  await env.writeGitignore(TOP_LEVEL_DIRECTORY, ignoreLines([gitignoredPath]));
  await env.writeInfoExclude(ignoreLines([infoExcludedPath]));
  const globalContent = ignoreLines([globalExcludedPath]);

  await withTempDir(GLOBAL_EXCLUDES_HOME_TEMP_PREFIX, async (home) => {
    const homeDefaultFile = join(
      home,
      GIT_DEFAULT_GLOBAL_IGNORE_PATH.CONFIG_DIRECTORY,
      GIT_DEFAULT_GLOBAL_IGNORE_PATH.GIT_DIRECTORY,
      GIT_DEFAULT_GLOBAL_IGNORE_PATH.IGNORE_FILE,
    );
    const xdgConfigHome = join(home, xdgDirectoryName);
    let globalExcludesFile: string;
    let processXdgConfigHome: string | undefined;
    switch (form) {
      case GLOBAL_EXCLUDES_CONFIGURATION_FORM.ABSOLUTE:
        globalExcludesFile = join(home, globalFileName);
        await writeUnderDirectory(home, globalFileName, globalContent);
        await configureCoreExcludesFile(env, globalExcludesFile);
        break;
      case GLOBAL_EXCLUDES_CONFIGURATION_FORM.RELATIVE:
        globalExcludesFile = join(env.productDir, globalFileName);
        await env.writeUntracked(globalFileName, globalContent);
        await configureCoreExcludesFile(env, globalFileName);
        break;
      case GLOBAL_EXCLUDES_CONFIGURATION_FORM.TILDE:
        globalExcludesFile = join(home, globalFileName);
        await writeUnderDirectory(home, globalFileName, globalContent);
        await configureCoreExcludesFile(env, `${GIT_HOME_PATH_PREFIX}${globalFileName}`);
        break;
      case GLOBAL_EXCLUDES_CONFIGURATION_FORM.EMPTY:
        globalExcludesFile = homeDefaultFile;
        await writeFileCreatingParents(homeDefaultFile, globalContent);
        await configureCoreExcludesFile(env, EMPTY_CONFIG_VALUE);
        break;
      case GLOBAL_EXCLUDES_CONFIGURATION_FORM.XDG_DEFAULT:
        globalExcludesFile = join(
          xdgConfigHome,
          GIT_DEFAULT_GLOBAL_IGNORE_PATH.GIT_DIRECTORY,
          GIT_DEFAULT_GLOBAL_IGNORE_PATH.IGNORE_FILE,
        );
        processXdgConfigHome = xdgConfigHome;
        await writeFileCreatingParents(globalExcludesFile, globalContent);
        break;
      case GLOBAL_EXCLUDES_CONFIGURATION_FORM.HOME_DEFAULT:
        globalExcludesFile = homeDefaultFile;
        await writeFileCreatingParents(homeDefaultFile, globalContent);
        break;
    }

    await withProcessEnvironment({
      [GIT_GLOBAL_EXCLUDES_ENV_KEYS.HOME]: home,
      [GIT_GLOBAL_EXCLUDES_ENV_KEYS.XDG_CONFIG_HOME]: processXdgConfigHome,
    }, async () => {
      await callback({
        gitignoredPath,
        infoExcludedPath,
        globalExcludedPath,
        infoExcludeFile: join(env.productDir, INFO_EXCLUDE_RELATIVE_PATH),
        globalExcludesFile,
      });
    });
  });
}

/** Paths a materialized ignore-source worktree carries and the reader config its overrides select. */
export type MaterializedIgnoreSourceWorktree = {
  readonly readerConfig: IgnoreSourceReaderConfig;
  readonly queryPaths: readonly string[];
  readonly queryDirectories: readonly string[];
};

/**
 * Writes every entry of a generated worktree state — tracked entries staged before any ignore
 * source exists — then writes each ignore source listing its entries as anchored patterns,
 * configures the global excludes file in local config, and writes the override ignore file
 * when the state selects one.
 */
export async function materializeIgnoreSourceWorktree(
  env: GitWorktreeEnv,
  state: IgnoreSourceWorktreeState,
): Promise<MaterializedIgnoreSourceWorktree> {
  for (const entry of state.entries) {
    await env.writeUntracked(ignoreSourceEntryPath(entry), fileContent());
  }
  const trackedPaths = state.entries.filter((entry) => entry.tracked).map(ignoreSourceEntryPath);
  if (trackedPaths.length > 0) {
    await env.runGit([GIT_TEST_SUBCOMMANDS.ADD, ...trackedPaths]);
  }

  const entriesListedIn = (source: string): readonly string[] =>
    state.entries.filter((entry) => entry.source === source).map(ignoreSourceEntryPath);
  await env.writeGitignore(TOP_LEVEL_DIRECTORY, ignoreLines(entriesListedIn(WORKTREE_ENTRY_IGNORE_SOURCE.GITIGNORE)));
  for (const directory of new Set(state.entries.map((entry) => entry.directory))) {
    const names = state.entries
      .filter((entry) =>
        entry.directory === directory && entry.source === WORKTREE_ENTRY_IGNORE_SOURCE.NESTED_GITIGNORE
      )
      .map((entry) => entry.name);
    if (names.length > 0) {
      await env.writeGitignore(directory, ignoreLines(names));
    }
  }
  await env.writeInfoExclude(ignoreLines(entriesListedIn(WORKTREE_ENTRY_IGNORE_SOURCE.INFO_EXCLUDE)));
  await env.writeUntracked(
    state.topLevelNames.globalExcludesFile,
    ignoreLines(entriesListedIn(WORKTREE_ENTRY_IGNORE_SOURCE.GLOBAL_EXCLUDES)),
  );
  await configureCoreExcludesFile(env, join(env.productDir, state.topLevelNames.globalExcludesFile));
  if (state.overrides.ignoreFilePresent) {
    await env.writeUntracked(
      state.topLevelNames.ignoreFile,
      ignoreLines(state.entries.filter((entry) => entry.listedInIgnoreFile).map(ignoreSourceEntryPath)),
    );
  }

  return {
    readerConfig: {
      overrides: {
        noIgnore: state.overrides.noIgnore,
        noIgnoreVcs: state.overrides.noIgnoreVcs,
        ignoreFile: state.overrides.ignoreFilePresent ? state.topLevelNames.ignoreFile : undefined,
      },
    },
    queryPaths: [
      ...state.entries.map(ignoreSourceEntryPath),
      state.topLevelNames.globalExcludesFile,
      state.topLevelNames.ignoreFile,
      state.topLevelNames.added,
    ],
    queryDirectories: [...new Set(state.entries.map((entry) => entry.directory))],
  };
}

/**
 * Changes git's view of a materialized worktree: writes the state's added top-level file and
 * rewrites the top-level `.gitignore` to list every entry.
 */
export async function mutateIgnoreSourceWorktree(env: GitWorktreeEnv, state: IgnoreSourceWorktreeState): Promise<void> {
  await env.writeUntracked(state.topLevelNames.added, fileContent());
  await env.writeGitignore(TOP_LEVEL_DIRECTORY, ignoreLines(state.entries.map(ignoreSourceEntryPath)));
}

/**
 * Moves the whole harness worktree out of its product directory for the callback's duration,
 * so no file, directory, or git metadata remains at `env.productDir`, then moves it back.
 */
export async function withWorktreeRelocated(env: GitWorktreeEnv, callback: () => Promise<void>): Promise<void> {
  await withTempDir(RELOCATED_WORKTREE_TEMP_PREFIX, async (holder) => {
    const relocated = join(holder, RELOCATED_WORKTREE_DIRECTORY);
    await rename(env.productDir, relocated);
    try {
      await callback();
    } finally {
      await rename(relocated, env.productDir);
    }
  });
}

function ignoreLines(paths: readonly string[]): string {
  return paths.map((path) => `${ANCHORED_PATTERN_PREFIX}${path}${LINE_TERMINATOR}`).join("");
}

function distinctNames(count: number): readonly string[] {
  const names = new Set<string>();
  while (names.size < count) {
    names.add(ignoredPattern());
  }
  return [...names];
}

async function writeFileCreatingParents(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function withProcessEnvironment(
  updates: Readonly<Record<string, string | undefined>>,
  callback: () => Promise<void>,
): Promise<void> {
  const previousValues = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(updates)) {
    previousValues.set(key, process.env[key]);
    setProcessEnvironmentValue(key, value);
  }
  try {
    await callback();
  } finally {
    for (const [key, value] of previousValues) {
      setProcessEnvironmentValue(key, value);
    }
  }
}

function setProcessEnvironmentValue(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
