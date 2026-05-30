import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const TEMP_ROOT = resolve(tmpdir());
const TEMP_ROOT_WITH_SEP = TEMP_ROOT.endsWith(sep) ? TEMP_ROOT : TEMP_ROOT + sep;

/**
 * The base cleanup-owning temp-directory primitive: creates a fresh directory under
 * `os.tmpdir()`, invokes the callback with its path, removes the directory on both the
 * return and throw paths, and returns the callback's result (rethrowing its error after
 * cleanup). Callback-scoped harnesses compose on this primitive.
 */
export async function withTempDir<T>(
  prefix: string,
  callback: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await createTempDir(prefix);
  try {
    return await callback(dir);
  } finally {
    await removeTempDir(dir);
  }
}

/**
 * Creates a fresh directory under `os.tmpdir()` for harnesses whose lifecycle cannot use the
 * callback-scoped `withTempDir` — a factory harness that returns a handle creates here and
 * removes through `removeTempDir`.
 */
export function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(TEMP_ROOT, prefix));
}

/**
 * Removes a temp directory, refusing any resolved path that does not live under `os.tmpdir()`.
 */
export async function removeTempDir(dir: string): Promise<void> {
  const resolved = resolve(dir);
  if (!resolved.startsWith(TEMP_ROOT_WITH_SEP)) {
    throw new Error(`Refusing to remove path outside os.tmpdir(): ${resolved}`);
  }
  await rm(resolved, { recursive: true, force: true });
}
