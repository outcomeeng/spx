// Git-worktree test harness — callback-scoped temp git repo with isolated identity, helpers for every git ignore source, submodule support, and process.env GIT_* strip-and-restore.
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
  readGit,
  runGit,
} from "@testing/harnesses/git-test-constants";

const TEMP_DIR_PREFIX = "spx-git-worktree-";
const GLOBAL_EXCLUDES_FILENAME = ".git-global-excludes";
const SUBMODULES_TEMP_DIRECTORY = ".git-submodules";
const GITIGNORE_FILENAME = ".gitignore";
export const INFO_EXCLUDE_RELATIVE_PATH = ".git/info/exclude";
const CORE_EXCLUDES_FILE_KEY = "core.excludesFile";
const SUBMODULE_ADD_SUBCOMMAND = "add";
const PROTOCOL_FILE_ALLOW_CONFIG = "protocol.file.allow=always";
const INITIAL_SUBMODULE_COMMIT_MESSAGE = "init submodule";
const GIT_ENV_PREFIX = "GIT_";
const TOP_LEVEL_DIRECTORY_DOT = ".";
const TOP_LEVEL_DIRECTORY_EMPTY = "";

export type GitWorktreeEnv = {
  readonly productDir: string;
  writeTracked(relativePath: string, content: string): Promise<void>;
  writeUntracked(relativePath: string, content: string): Promise<void>;
  writeGitignore(directory: string, content: string): Promise<void>;
  writeInfoExclude(content: string): Promise<void>;
  configureGlobalExcludes(content: string): Promise<void>;
  addSubmodule(relativePath: string): Promise<void>;
  commit(message: string): Promise<void>;
  runGit(args: readonly string[]): Promise<string>;
};

type CapturedGitEnv = ReadonlyMap<string, string | undefined>;

export async function withGitWorktreeEnv(
  callback: (env: GitWorktreeEnv) => Promise<void>,
): Promise<void> {
  const productDir = join(tmpdir(), `${TEMP_DIR_PREFIX}${randomUUID()}`);
  await mkdir(productDir, { recursive: true });

  const captured = captureAndStripProcessGitEnv();

  try {
    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY, GIT_TEST_CONFIG.EMAIL]);
    await runGit(
      productDir,
      [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.USER_NAME_KEY, GIT_TEST_CONFIG.USER_NAME],
    );

    const env: GitWorktreeEnv = buildEnv(productDir);
    await callback(env);
  } finally {
    restoreProcessGitEnv(captured);
    try {
      await rm(productDir, { recursive: true, force: true });
    } catch {
      // Swallow cleanup errors so the original callback error always propagates.
    }
  }
}

function buildEnv(productDir: string): GitWorktreeEnv {
  return {
    productDir,
    writeTracked: async (relativePath, content) => {
      await writeUnderProductDir(productDir, relativePath, content);
      await runGit(productDir, [GIT_TEST_SUBCOMMANDS.ADD, relativePath]);
    },
    writeUntracked: async (relativePath, content) => {
      await writeUnderProductDir(productDir, relativePath, content);
    },
    writeGitignore: async (directory, content) => {
      const target = directory === TOP_LEVEL_DIRECTORY_DOT || directory === TOP_LEVEL_DIRECTORY_EMPTY
        ? GITIGNORE_FILENAME
        : join(directory, GITIGNORE_FILENAME);
      await writeUnderProductDir(productDir, target, content);
    },
    writeInfoExclude: async (content) => {
      await writeUnderProductDir(productDir, INFO_EXCLUDE_RELATIVE_PATH, content);
    },
    configureGlobalExcludes: async (content) => {
      const excludesPath = join(productDir, GLOBAL_EXCLUDES_FILENAME);
      await writeFile(excludesPath, content);
      // core.excludesFile applies at any config level; local config avoids GIT_CONFIG_GLOBAL mutation across the harness scope.
      await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CONFIG, CORE_EXCLUDES_FILE_KEY, excludesPath]);
    },
    addSubmodule: async (relativePath) => {
      await addLocalSubmodule(productDir, relativePath);
    },
    commit: async (message) => {
      await runGit(productDir, [GIT_TEST_SUBCOMMANDS.COMMIT, GIT_TEST_FLAGS.COMMIT_MESSAGE, message]);
    },
    runGit: async (args) => {
      return readGit(productDir, args);
    },
  };
}

async function writeUnderProductDir(productDir: string, relativePath: string, content: string): Promise<void> {
  const absolute = join(productDir, relativePath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
}

async function addLocalSubmodule(productDir: string, relativePath: string): Promise<void> {
  const innerRepoDir = join(productDir, SUBMODULES_TEMP_DIRECTORY, randomUUID());
  await mkdir(innerRepoDir, { recursive: true });
  await runGit(innerRepoDir, [GIT_TEST_SUBCOMMANDS.INIT]);
  await runGit(innerRepoDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY, GIT_TEST_CONFIG.EMAIL]);
  await runGit(
    innerRepoDir,
    [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.USER_NAME_KEY, GIT_TEST_CONFIG.USER_NAME],
  );
  await runGit(
    innerRepoDir,
    [
      GIT_TEST_SUBCOMMANDS.COMMIT,
      GIT_TEST_FLAGS.ALLOW_EMPTY,
      GIT_TEST_FLAGS.COMMIT_MESSAGE,
      INITIAL_SUBMODULE_COMMIT_MESSAGE,
    ],
  );

  await runGit(
    productDir,
    [
      GIT_TEST_FLAGS.CONFIG_OVERRIDE,
      PROTOCOL_FILE_ALLOW_CONFIG,
      GIT_TEST_SUBCOMMANDS.SUBMODULE,
      SUBMODULE_ADD_SUBCOMMAND,
      innerRepoDir,
      relativePath,
    ],
  );
}

function captureAndStripProcessGitEnv(): CapturedGitEnv {
  const captured = new Map<string, string | undefined>();
  for (const key of Object.keys(process.env)) {
    if (key.startsWith(GIT_ENV_PREFIX)) {
      captured.set(key, process.env[key]);
      delete process.env[key];
    }
  }
  return captured;
}

function restoreProcessGitEnv(captured: CapturedGitEnv): void {
  for (const [key, value] of captured) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
