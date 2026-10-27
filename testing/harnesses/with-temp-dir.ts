import { getProcessTempDirectory } from "@/lib/temp-directory";

/**
 * The base cleanup-owning temp-directory primitive: creates a fresh directory under the run root
 * of the temp-directory library, invokes the callback with its path, removes the directory on both
 * the return and throw paths, and returns the callback's result. A cleanup failure is swallowed
 * so it never masks the callback's own result or error. Callback-scoped harnesses compose
 * on this primitive.
 */
export async function withTempDir<T>(
  prefix: string,
  callback: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await createTempDir(prefix);
  try {
    return await callback(dir);
  } finally {
    await removeTempDir(dir).catch(() => {});
  }
}

/**
 * Creates a fresh directory under the run root for harnesses whose lifecycle cannot use the
 * callback-scoped `withTempDir` — a factory harness that returns a handle creates here and
 * removes through `removeTempDir`.
 */
export async function createTempDir(prefix: string): Promise<string> {
  return getProcessTempDirectory().createDirectory(prefix);
}

/**
 * Removes a temp directory, refusing any path that does not live under the run root.
 */
export async function removeTempDir(dir: string): Promise<void> {
  getProcessTempDirectory().releaseDirectory(dir);
}
