/**
 * Vitest setup file that records the files a test module opens.
 *
 * Registered through the `setupFiles` option of a programmatic run, it wraps the read entry
 * points of the worker's `node:fs` module, collects the absolute path of each file opened, and
 * at the end of the module's file suite leaves the sorted unique paths in the module's metadata
 * under the recorder's metadata key. Every wrapper delegates to the original function with its
 * original arguments, so the recorder alters no value a test reads and writes nothing itself.
 */
import fs, { realpathSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, TestRunner } from "vitest";

import { READ_RECORDER_META_KEY } from "./read-recorder";

/** The synchronous and callback `node:fs` functions whose first argument names the file they open. */
const WRAPPED_FS_FUNCTIONS = ["readFileSync", "readFile", "openSync", "open", "createReadStream"] as const;
/** The `node:fs/promises` functions whose first argument names the file they open. */
const WRAPPED_PROMISES_FUNCTIONS = ["readFile", "open"] as const;

type PathLike = string | Buffer | URL | number;
type Wrappable = (target: PathLike, ...rest: unknown[]) => unknown;
type FunctionTable = Record<string, Wrappable>;

function absolutePathOf(target: PathLike): string | undefined {
  if (typeof target === "number") return undefined;
  const asPath = target instanceof URL ? fileURLToPath(target) : target.toString();
  const absolute = resolve(asPath);
  try {
    return realpathSync(absolute);
  } catch {
    return undefined;
  }
}

function installRecorder(opened: Set<string>): () => void {
  const originals: Array<() => void> = [];
  const wrapTable = (table: FunctionTable, names: readonly string[]): void => {
    for (const name of names) {
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
  };
  wrapTable(fs as unknown as FunctionTable, WRAPPED_FS_FUNCTIONS);
  wrapTable(fs.promises as unknown as FunctionTable, WRAPPED_PROMISES_FUNCTIONS);
  syncBuiltinESMExports();
  return () => {
    for (const restore of originals) restore();
    syncBuiltinESMExports();
  };
}

const openedPaths = new Set<string>();
const restoreRecorder = installRecorder(openedPaths);

const moduleSuite = TestRunner.getCurrentSuite();

afterAll(() => {
  restoreRecorder();
  if (openedPaths.size === 0) return;
  const sortedPaths = [...openedPaths].sort((left, right) => left.localeCompare(right));
  Object.assign(moduleSuite.file.meta, { [READ_RECORDER_META_KEY]: sortedPaths });
});
