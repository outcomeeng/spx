/**
 * Session-reconciliation harness: controlled probe boundaries and store
 * observations for the reconcile evidence.
 *
 * The controlled implementations here are Stage-5 failure simulations at the
 * injected boundaries `spx/17-state.adr.md` declares — a git runner whose
 * lookup fails fatally, and an entry reader whose read fails for a reason
 * outside the absent/directory codes. They expose outcomes and observations
 * only; every verdict predicate stays in the executed test files.
 *
 * @module testing/harnesses/session/reconcile
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import type { ReconcileDependencies } from "@/commands/session/reconcile";
import { SESSION_FILE_ENCODING } from "@/domains/session/types";
import type { GitDependencies } from "@/lib/git/root";
import { withTempDir } from "../with-temp-dir";
import { createSessionHarness, type SessionHarness } from "./harness";

/** Git's documented fatal exit status — a lookup git cannot answer. */
export const GIT_FATAL_EXIT_CODE = 128;

const GIT_FATAL_STDERR = "fatal: not a git repository";

/** The Node error code for a read denied by permissions — a non-absent, non-directory read failure. */
const ENTRY_PERMISSION_ERROR_CODE = "EACCES";

/**
 * A git runner whose every invocation reports git's fatal exit — the
 * failure-simulation double for a branch lookup git cannot answer.
 */
export function createFatalGitDeps(): GitDependencies {
  return {
    execa: async () => ({
      exitCode: GIT_FATAL_EXIT_CODE,
      stdout: "",
      stderr: GIT_FATAL_STDERR,
    }),
  };
}

/**
 * Reconcile read boundaries that read entries from the real filesystem, except
 * the named path, whose read fails with a permission error — the
 * failure-simulation double for an entry unreadable for a reason other than
 * absence or being a directory.
 */
export function createUnreadableEntryReconcileDeps(
  git: GitDependencies,
  cwd: string,
  unreadablePath: string,
): ReconcileDependencies {
  const unreadableAbsolute = resolve(cwd, unreadablePath);
  return {
    git,
    readFile: (path: string, encoding: BufferEncoding) => {
      if (path === unreadableAbsolute) {
        return Promise.reject(
          Object.assign(new Error(`${ENTRY_PERMISSION_ERROR_CODE}: permission denied, open '${path}'`), {
            code: ENTRY_PERMISSION_ERROR_CODE,
          }),
        );
      }
      return readFile(path, encoding);
    },
  };
}

/** Reconcile read boundaries over the real filesystem with the supplied git runner. */
export function createReconcileDeps(git: GitDependencies): ReconcileDependencies {
  return { git, readFile };
}

/** Materializes `entryPath` under `root` as a readable file, creating its parent directories. */
export async function writeReadableEntry(root: string, entryPath: string): Promise<void> {
  const absolute = join(root, entryPath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `content of ${entryPath}`);
}

/** The session store and working directory one reconcile case runs against. */
export interface ReconcileStoreContext {
  readonly harness: SessionHarness;
  readonly cwd: string;
}

/**
 * Runs `callback` against a fresh session store and a fresh temp working
 * directory, removing both on the return and throw paths — the shared
 * arrangement lifecycle for every reconcile case.
 */
export async function withReconcileStore<T>(
  callback: (context: ReconcileStoreContext) => Promise<T>,
): Promise<T> {
  const harness = await createSessionHarness();
  try {
    return await withTempDir("spx-reconcile-", (cwd) => callback({ harness, cwd }));
  } finally {
    await harness.cleanup();
  }
}

/**
 * A byte-level observation of a directory tree: every file's path relative to
 * `root`, mapped to its content, sorted by path.
 */
export async function snapshotDirectory(root: string): Promise<ReadonlyArray<readonly [string, string]>> {
  const entries: Array<readonly [string, string]> = [];
  await collectFiles(root, root, entries);
  return entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
}

async function collectFiles(
  root: string,
  directory: string,
  entries: Array<readonly [string, string]>,
): Promise<void> {
  const dirents = await readdir(directory, { withFileTypes: true });
  for (const dirent of dirents) {
    const entryPath = join(directory, dirent.name);
    if (dirent.isDirectory()) {
      await collectFiles(root, entryPath, entries);
    } else if (dirent.isFile()) {
      entries.push([relative(root, entryPath), await readFile(entryPath, SESSION_FILE_ENCODING)]);
    }
  }
}
