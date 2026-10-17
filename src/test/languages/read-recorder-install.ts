/**
 * Worker-side read recorder: wraps the read entry points of the worker's `node:fs` module so
 * the absolute path of each file opened is collected, and restores them on request.
 *
 * Every wrapper delegates to the original function with its original arguments and returns its
 * result unchanged, so the recorder alters no value a test reads and writes nothing itself. The
 * module holds no Vitest dependency; the setup file that registers the recorder in a worker owns
 * the Vitest lifecycle and the module-metadata effect.
 */
import fs, { realpathSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The `node:fs` surfaces whose read entry points the recorder wraps. */
export const READ_SURFACE = {
  FS: "fs",
  PROMISES: "promises",
} as const;
export type ReadSurface = (typeof READ_SURFACE)[keyof typeof READ_SURFACE];

/** A `node:fs` read entry point whose first argument names the file it opens. */
export interface ReadEntryPoint {
  readonly surface: ReadSurface;
  readonly name: string;
}

/** The read entry points the recorder wraps: synchronous and callback `node:fs`, and `node:fs/promises`. */
export const READ_ENTRY_POINTS = [
  { surface: READ_SURFACE.FS, name: "readFileSync" },
  { surface: READ_SURFACE.FS, name: "readFile" },
  { surface: READ_SURFACE.FS, name: "openSync" },
  { surface: READ_SURFACE.FS, name: "open" },
  { surface: READ_SURFACE.FS, name: "createReadStream" },
  { surface: READ_SURFACE.PROMISES, name: "readFile" },
  { surface: READ_SURFACE.PROMISES, name: "open" },
] as const satisfies readonly ReadEntryPoint[];

type PathLike = string | Buffer | URL | number;
type Wrappable = (target: PathLike, ...rest: unknown[]) => unknown;
type FunctionTable = Record<string, Wrappable>;

/** An installed recorder: the paths it collected so far, and the restoration of every wrapped function. */
export interface ReadRecorder {
  /** The sorted unique absolute paths opened since installation, or `undefined` when none was opened. */
  readonly recordedPaths: () => readonly string[] | undefined;
  /** Returns every wrapped `node:fs` function, and every named binding of the module, to its original value. */
  readonly restore: () => void;
}

function absolutePathOf(target: PathLike): string | undefined {
  try {
    if (typeof target === "number") return undefined;
    const asPath = target instanceof URL ? fileURLToPath(target) : target.toString();
    return realpathSync(resolve(asPath));
  } catch {
    return undefined;
  }
}

/** Wraps the read entry points of the worker's `node:fs` module and starts collecting the paths they open. */
export function installReadRecorder(): ReadRecorder {
  const opened = new Set<string>();
  const originals: Array<() => void> = [];
  const tables: Record<ReadSurface, FunctionTable> = {
    [READ_SURFACE.FS]: fs as unknown as FunctionTable,
    [READ_SURFACE.PROMISES]: fs.promises as unknown as FunctionTable,
  };
  for (const { surface, name } of READ_ENTRY_POINTS) {
    const table = tables[surface];
    const original = table[name];
    if (typeof original !== "function") continue;
    table[name] = function recorded(this: unknown, target: PathLike, ...rest: unknown[]) {
      const absolute = absolutePathOf(target);
      if (absolute !== undefined) opened.add(absolute);
      return original.call(this, target, ...rest);
    };
    originals.push(() => {
      table[name] = original;
    });
  }
  syncBuiltinESMExports();
  return {
    recordedPaths: () => opened.size === 0 ? undefined : [...opened].sort((left, right) => left.localeCompare(right)),
    restore: () => {
      for (const restoreOne of originals) restoreOne();
      syncBuiltinESMExports();
    },
  };
}
