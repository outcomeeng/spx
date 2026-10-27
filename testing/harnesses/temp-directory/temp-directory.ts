/**
 * Temp-directory host harness: opens runs of the temp-directory primitive over a real filesystem.
 *
 * The host's fixture root comes from the shared temp-directory harness, and each run owns one worktree
 * directory inside it. A run wires the primitive to the real filesystem through a recording wrapper, to
 * an in-memory environment record that stands in for one process's environment, and to a controlled
 * worktree resolver (the real-Git resolution is exercised by the process-level evidence). The harness
 * returns observations and handles only: recorded paths, environment snapshots, and per-step traces. It
 * asserts nothing and returns no verdict.
 *
 * @module testing/harnesses/temp-directory/temp-directory
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";

import {
  createTempDirectory,
  defaultRandomToken,
  defaultTempDirectoryFileSystem,
  type TempDirectory,
  type TempDirectoryDeps,
  type TempDirectoryEnvironment,
  type TempDirectoryFileSystem,
} from "@/lib/temp-directory";
import {
  TEMP_DIRECTORY_OPERATION,
  type TempDirectoryOperation,
} from "@testing/generators/temp-directory/temp-directory";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const HOST_TEMP_DIR_PREFIX = "spx-temp-directory-host-";
const WORKTREE_DIRECTORY_PREFIX = "worktree-";
const LEFTOVER_CONTENT_FILE_NAME = "leftover-content";

/** One step of an executed interleaving, with the filesystem state observed right after it. */
export interface TempDirectoryStep {
  readonly operation: TempDirectoryOperation["kind"];
  /** The directory a request returned, or the directory a release targeted. */
  readonly path: string;
  /** The product directory a scratch request or its release belongs to. */
  readonly productDirectory?: string;
  readonly existsAfter: boolean;
}

/** One process's use of the primitive in one worktree. */
export interface TempDirectoryRun {
  readonly worktreeRoot: string;
  readonly tempDirectory: TempDirectory;
  /** The process environment this run's primitive reads and writes. */
  readonly environment: TempDirectoryEnvironment;
  /** Every directory the primitive listed through its filesystem dependency, in order. */
  readonly listed: readonly string[];
  /** Every path the primitive removed through its filesystem dependency, in order. */
  readonly removed: readonly string[];
  /** Every synchronous exit hook the primitive registered. */
  readonly exitHooks: readonly (() => void)[];
  /** A copy of the run's environment at this moment, as a child process would inherit it. */
  environmentSnapshot(): Record<string, string>;
  /** Applies an interleaving of requests and releases and returns the step trace. */
  execute(operations: readonly TempDirectoryOperation[]): Promise<TempDirectoryStep[]>;
}

export interface OpenRunOptions {
  /** The worktree the run lives in; a fresh empty worktree when omitted. */
  readonly worktreeRoot?: string;
  /** A run whose environment this run inherits, as a child process inherits its parent's. */
  readonly inheritFrom?: TempDirectoryRun;
}

export interface TempDirectoryHost {
  /** The directory that holds every worktree this host created. */
  readonly fixtureRoot: string;
  /** Creates an empty directory standing in for one worktree root and returns its path. */
  createWorktree(): string;
  /** Creates a product directory below a worktree root and returns its path. */
  createProductDirectory(worktreeRoot: string, segments: readonly string[]): string;
  /** Creates a leftover entry — a directory holding one file — at `path`, creating parents as needed. */
  seedLeftover(path: string): void;
  openRun(options?: OpenRunOptions): TempDirectoryRun;
}

interface LiveDirectory {
  readonly operation: TempDirectoryOperation["kind"];
  readonly path: string;
  readonly productDirectory?: string;
}

function createRecordEnvironment(initial: Record<string, string>): {
  readonly environment: TempDirectoryEnvironment;
  readonly snapshot: () => Record<string, string>;
} {
  const record: Record<string, string> = { ...initial };
  return {
    environment: {
      get: (name) => record[name],
      set: (name, value) => {
        record[name] = value;
      },
    },
    snapshot: () => ({ ...record }),
  };
}

function createRecordingFileSystem(
  base: TempDirectoryFileSystem,
  listed: string[],
  removed: string[],
): TempDirectoryFileSystem {
  return {
    listDirectory: (path) => {
      listed.push(path);
      return base.listDirectory(path);
    },
    makeDirectory: (path) => base.makeDirectory(path),
    removeTree: (path) => {
      removed.push(path);
      base.removeTree(path);
    },
  };
}

function createHost(fixtureRoot: string): TempDirectoryHost {
  const worktrees: string[] = [];

  const host: TempDirectoryHost = {
    fixtureRoot,
    createWorktree() {
      const worktreeRoot = join(fixtureRoot, `${WORKTREE_DIRECTORY_PREFIX}${worktrees.length}`);
      mkdirSync(worktreeRoot, { recursive: true });
      worktrees.push(worktreeRoot);
      return worktreeRoot;
    },
    createProductDirectory(worktreeRoot, segments) {
      const productDirectory = join(worktreeRoot, ...segments);
      mkdirSync(productDirectory, { recursive: true });
      return productDirectory;
    },
    seedLeftover(path) {
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, LEFTOVER_CONTENT_FILE_NAME), "");
    },
    openRun(options = {}) {
      const worktreeRoot = options.worktreeRoot ?? host.createWorktree();
      const listed: string[] = [];
      const removed: string[] = [];
      const exitHooks: (() => void)[] = [];
      const { environment, snapshot } = createRecordEnvironment(options.inheritFrom?.environmentSnapshot() ?? {});

      const deps: TempDirectoryDeps = {
        fileSystem: createRecordingFileSystem(defaultTempDirectoryFileSystem(), listed, removed),
        environment,
        workingDirectory: worktreeRoot,
        resolveWorktreeRoot: (directory) =>
          Promise.resolve(
            worktrees.find((root) => directory === root || directory.startsWith(`${root}${sep}`)) ?? worktreeRoot,
          ),
        randomToken: defaultRandomToken,
        onExit: (hook) => {
          exitHooks.push(hook);
        },
      };
      const tempDirectory = createTempDirectory(deps);

      const run: TempDirectoryRun = {
        worktreeRoot,
        tempDirectory,
        environment,
        listed,
        removed,
        exitHooks,
        environmentSnapshot: snapshot,
        async execute(operations) {
          const live: LiveDirectory[] = [];
          const steps: TempDirectoryStep[] = [];
          for (const operation of operations) {
            if (operation.kind === TEMP_DIRECTORY_OPERATION.CREATE) {
              const path = await tempDirectory.createDirectory();
              live.push({ operation: operation.kind, path });
              steps.push({ operation: operation.kind, path, existsAfter: existsSync(path) });
            } else if (operation.kind === TEMP_DIRECTORY_OPERATION.CREATE_SCRATCH) {
              const productDirectory = host.createProductDirectory(worktreeRoot, operation.productSegments);
              const path = await tempDirectory.createScratchDirectory(productDirectory);
              live.push({ operation: operation.kind, path, productDirectory });
              steps.push({ operation: operation.kind, path, productDirectory, existsAfter: existsSync(path) });
            } else if (live.length > 0) {
              const [target] = live.splice(operation.pick % live.length, 1);
              if (target.operation === TEMP_DIRECTORY_OPERATION.CREATE) {
                tempDirectory.releaseDirectory(target.path);
              } else {
                tempDirectory.releaseScratchDirectory(target.path);
              }
              steps.push({
                operation: operation.kind,
                path: target.path,
                productDirectory: target.productDirectory,
                existsAfter: existsSync(target.path),
              });
            }
          }
          return steps;
        },
      };
      return run;
    },
  };
  return host;
}

/**
 * Runs `callback` with a host whose fixture root is a directory the shared temp-directory harness
 * supplies and removes.
 */
export async function withTempDirectoryHost<T>(callback: (host: TempDirectoryHost) => Promise<T>): Promise<T> {
  return withTempDir(HOST_TEMP_DIR_PREFIX, (fixtureRoot) => callback(createHost(fixtureRoot)));
}
