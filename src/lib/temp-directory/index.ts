import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { detectWorktreeProductRoot } from "@/lib/git/root";
import { ERROR_CODE_NOT_FOUND, hasErrorCode, worktreeScopeDir } from "@/lib/state-store";

/** Environment variables the primitive reads and exports. */
export const TEMP_DIRECTORY_ENV_VAR = {
  RUN_ROOT: "SPX_RUN_TEMP_ROOT",
  GIT_CEILING_DIRECTORIES: "GIT_CEILING_DIRECTORIES",
} as const;

/** Path segments and name prefixes of the run roots and the product-local scratch directories. */
export const TEMP_DIRECTORY_PATH = {
  RUN_ROOTS_DIR: "test-runs",
  RUN_ROOT_PREFIX: "run-",
  SCRATCH_PARENT_SEGMENTS: ["node_modules", ".cache", "spx"],
  SCRATCH_PREFIX: "spx-run-",
} as const;

const RANDOM_TOKEN_BYTES = 8;
const RANDOM_TOKEN_ENCODING = "hex";
const EXIT_EVENT = "exit";
const NO_NAME_PREFIX = "";
const BOUND_ERROR_NAME = "TempDirectoryBoundError";

/** Raised when a creation or release names a path outside the run root and the scratch parents the primitive resolved. */
export class TempDirectoryBoundError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`Refusing a path outside the run root and scratch parents: ${path}`);
    this.name = BOUND_ERROR_NAME;
    this.path = path;
  }
}

export interface TempDirectoryFileSystem {
  /** Entry names of `path`; an absent directory has none. */
  listDirectory(path: string): readonly string[];
  /** Creates `path` and any missing parents. */
  makeDirectory(path: string): void;
  /** Removes `path` with everything inside it; an absent path is not an error. */
  removeTree(path: string): void;
}

export interface TempDirectoryEnvironment {
  get(name: string): string | undefined;
  set(name: string, value: string): void;
}

export interface TempDirectoryDeps {
  readonly fileSystem: TempDirectoryFileSystem;
  readonly environment: TempDirectoryEnvironment;
  /** The directory the run resolves its worktree from. */
  readonly workingDirectory: string;
  /** The worktree root that contains `directory`. */
  readonly resolveWorktreeRoot: (directory: string) => Promise<string>;
  readonly randomToken: () => string;
  /** Registers a synchronous hook that runs when the process ends. */
  readonly onExit: (hook: () => void) => void;
}

export interface TempDirectory {
  /** Creates a directory inside the run root, creating the root first when the process inherits none. */
  createDirectory(namePrefix?: string): Promise<string>;
  /** Removes a directory `createDirectory` returned. */
  releaseDirectory(path: string): void;
  /** Creates a scratch directory under the product's scratch parent. */
  createScratchDirectory(productDir: string): Promise<string>;
  /** Removes a directory `createScratchDirectory` returned. */
  releaseScratchDirectory(path: string): void;
}

export function defaultTempDirectoryFileSystem(): TempDirectoryFileSystem {
  return {
    listDirectory: (path) => {
      try {
        return readdirSync(path);
      } catch (error) {
        if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return [];
        throw error;
      }
    },
    makeDirectory: (path) => {
      mkdirSync(path, { recursive: true });
    },
    removeTree: (path) => {
      rmSync(path, { recursive: true, force: true });
    },
  };
}

export function defaultRandomToken(): string {
  return randomBytes(RANDOM_TOKEN_BYTES).toString(RANDOM_TOKEN_ENCODING);
}

function isInside(parent: string, path: string): boolean {
  return path.startsWith(`${parent}${sep}`);
}

export function createTempDirectory(deps: TempDirectoryDeps): TempDirectory {
  const { fileSystem, environment } = deps;
  const scratchParents = new Set<string>();
  const sweptScratchParents = new Set<string>();
  let worktreeRoot: Promise<string> | undefined;
  let runRoot: Promise<string> | undefined;

  const resolveWorktree = (): Promise<string> => {
    worktreeRoot ??= deps.resolveWorktreeRoot(deps.workingDirectory).then((root) => resolve(root));
    return worktreeRoot;
  };

  const createRunRoot = async (): Promise<string> => {
    const runRoots = join(worktreeScopeDir(await resolveWorktree()), TEMP_DIRECTORY_PATH.RUN_ROOTS_DIR);
    for (const name of fileSystem.listDirectory(runRoots)) {
      fileSystem.removeTree(join(runRoots, name));
    }
    const root = join(runRoots, `${TEMP_DIRECTORY_PATH.RUN_ROOT_PREFIX}${deps.randomToken()}`);
    fileSystem.makeDirectory(root);
    environment.set(TEMP_DIRECTORY_ENV_VAR.RUN_ROOT, root);
    environment.set(TEMP_DIRECTORY_ENV_VAR.GIT_CEILING_DIRECTORIES, root);
    deps.onExit(() => fileSystem.removeTree(root));
    return root;
  };

  const ensureRunRoot = (): Promise<string> => {
    const inherited = environment.get(TEMP_DIRECTORY_ENV_VAR.RUN_ROOT);
    if (inherited !== undefined) return Promise.resolve(inherited);
    runRoot ??= createRunRoot();
    return runRoot;
  };

  const createInRunRoot = async (namePrefix: string): Promise<string> => {
    const root = resolve(await ensureRunRoot());
    const path = resolve(join(root, `${namePrefix}${deps.randomToken()}`));
    if (!isInside(root, path)) throw new TempDirectoryBoundError(path);
    fileSystem.makeDirectory(path);
    return path;
  };

  const releaseInsideRunRoot = (path: string): boolean => {
    const root = environment.get(TEMP_DIRECTORY_ENV_VAR.RUN_ROOT);
    return root !== undefined && isInside(resolve(root), path);
  };

  return {
    createDirectory: (namePrefix = NO_NAME_PREFIX) => createInRunRoot(namePrefix),

    releaseDirectory(path) {
      const target = resolve(path);
      if (!releaseInsideRunRoot(target)) throw new TempDirectoryBoundError(path);
      fileSystem.removeTree(target);
    },

    async createScratchDirectory(productDir) {
      const worktree = await resolveWorktree();
      const parent = join(resolve(productDir), ...TEMP_DIRECTORY_PATH.SCRATCH_PARENT_SEGMENTS);
      // A parent outside the worktree is created in but never swept, recorded, or released: the primitive reads and removes only inside its own worktree.
      if (isInside(worktree, parent)) {
        if (!sweptScratchParents.has(parent)) {
          sweptScratchParents.add(parent);
          for (const name of fileSystem.listDirectory(parent)) {
            if (name.startsWith(TEMP_DIRECTORY_PATH.SCRATCH_PREFIX)) fileSystem.removeTree(join(parent, name));
          }
        }
        scratchParents.add(parent);
      }
      const path = join(parent, `${TEMP_DIRECTORY_PATH.SCRATCH_PREFIX}${deps.randomToken()}`);
      fileSystem.makeDirectory(path);
      return path;
    },

    releaseScratchDirectory(path) {
      const target = resolve(path);
      const inScratchParent = scratchParents.has(dirname(target))
        && basename(target).startsWith(TEMP_DIRECTORY_PATH.SCRATCH_PREFIX);
      if (!inScratchParent && !releaseInsideRunRoot(target)) throw new TempDirectoryBoundError(path);
      fileSystem.removeTree(target);
    },
  };
}

let processTempDirectory: TempDirectory | undefined;

/** The process-wide primitive over `process.env`, the process working directory, Git worktree resolution, and `process.on("exit")`. */
export function getProcessTempDirectory(): TempDirectory {
  processTempDirectory ??= createTempDirectory({
    fileSystem: defaultTempDirectoryFileSystem(),
    environment: {
      get: (name) => process.env[name],
      set: (name, value) => {
        process.env[name] = value;
      },
    },
    workingDirectory: CONFIG_PROCESS_CWD.read(),
    resolveWorktreeRoot: async (directory) => (await detectWorktreeProductRoot(directory)).productDir,
    randomToken: defaultRandomToken,
    onExit: (hook) => {
      process.on(EXIT_EVENT, hook);
    },
  });
  return processTempDirectory;
}
