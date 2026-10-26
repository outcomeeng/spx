/**
 * Real-filesystem harness for verification-input evidence: a temporary Git worktree whose files,
 * directories, symbolic links, and permissions the caller arranges, with observations of the tree
 * before and after an inspection. It returns observations and handles, never verdicts.
 */
import { execa } from "execa";
import { appendFile, chmod, mkdir, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { referenceSha256 } from "@testing/generators/verification-input";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const TEMP_PREFIX = "spx-verification-input-";
const GIT_BINARY = "git";
const GIT_INIT_ARGS = ["init", "--quiet"] as const;
const GIT_ADD_ARGS = ["add", "--"] as const;
const UNREADABLE_MODE = "000";
const GITIGNORE_FILE = ".gitignore";
const OUTSIDE_DIRECTORY_PREFIX = "spx-verification-input-outside-";

export interface VerificationInputEnv {
  /** Absolute path of the worktree root. */
  readonly root: string;
  /** Absolute path of a directory outside the worktree, removed with the environment. */
  readonly outsideDir: string;
  writeFile(relativePath: string, bytes: Uint8Array | string): Promise<string>;
  makeDirectory(relativePath: string): Promise<string>;
  symlink(target: string, relativeLinkPath: string): Promise<string>;
  makeUnreadable(relativePath: string): Promise<void>;
  /** Writes a file directly under `outsideDir` and returns its absolute path. */
  writeOutside(name: string, bytes: Uint8Array | string): Promise<string>;
  /** Appends the path to the worktree's `.gitignore`, so git stops listing the file. */
  ignore(relativePath: string): Promise<void>;
  /** Adds the file to the Git index, so git lists it as tracked rather than as untracked. */
  track(relativePath: string): Promise<void>;
  /** The path from the worktree root to an absolute path, with parent segments where it lies outside. */
  relativeFromRoot(absolutePath: string): string;
  /** Path to digest of every file and symlink-free directory entry under the worktree, excluding `.git`. */
  snapshot(): Promise<ReadonlyMap<string, string>>;
}

async function walk(root: string, relative: string, entries: Map<string, string>): Promise<void> {
  const directory = join(root, relative);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = relative === "" ? entry.name : `${relative}/${entry.name}`;
    if (child === ".git") continue;
    if (entry.isDirectory()) {
      entries.set(child, "directory");
      await walk(root, child, entries);
    } else if (entry.isFile()) {
      entries.set(child, referenceSha256(await readFile(join(root, child))));
    } else {
      entries.set(child, "other");
    }
  }
}

export async function withVerificationInputEnv<T>(
  callback: (env: VerificationInputEnv) => Promise<T>,
): Promise<T> {
  return withTempDir(TEMP_PREFIX, async (root) =>
    withTempDir(OUTSIDE_DIRECTORY_PREFIX, async (outsideDir) => {
      await execa(GIT_BINARY, [...GIT_INIT_ARGS], { cwd: root });
      const env: VerificationInputEnv = {
        root,
        outsideDir,
        async writeFile(relativePath, bytes) {
          const absolute = join(root, relativePath);
          await mkdir(dirname(absolute), { recursive: true });
          await writeFile(absolute, bytes);
          return absolute;
        },
        async makeDirectory(relativePath) {
          const absolute = join(root, relativePath);
          await mkdir(absolute, { recursive: true });
          return absolute;
        },
        async symlink(target, relativeLinkPath) {
          const absolute = join(root, relativeLinkPath);
          await mkdir(dirname(absolute), { recursive: true });
          await symlink(target, absolute);
          return absolute;
        },
        async makeUnreadable(relativePath) {
          await chmod(join(root, relativePath), UNREADABLE_MODE);
        },
        async writeOutside(name, bytes) {
          const absolute = join(outsideDir, name);
          await writeFile(absolute, bytes);
          return absolute;
        },
        async ignore(relativePath) {
          await appendFile(join(root, GITIGNORE_FILE), `${relativePath}\n`);
        },
        async track(relativePath) {
          await execa(GIT_BINARY, [...GIT_ADD_ARGS, relativePath], { cwd: root });
        },
        relativeFromRoot(absolutePath) {
          return relative(root, absolutePath);
        },
        async snapshot() {
          const entries = new Map<string, string>();
          await walk(root, "", entries);
          return entries;
        },
      };
      return callback(env);
    }));
}
