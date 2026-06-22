/**
 * Atomic file replacement: write the new content to a uniquely named temporary
 * sibling of the target, then rename it onto the target so a concurrent reader
 * observes either the complete prior file or the complete new file. The
 * uniqueness suffix is drawn from an injected `node:crypto` random-bytes source,
 * and both the filesystem and the random-bytes source are injected.
 *
 * @module lib/atomic-file-write
 */

/** Filesystem boundary the atomic write performs all I/O through. */
export interface AtomicWriteFileSystem {
  writeFile(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string, options: { readonly force: true }): Promise<void>;
}

/** Source of cryptographic random bytes for the temporary-name suffix. */
export type RandomBytes = (size: number) => Buffer;

export interface AtomicWriteOptions {
  readonly fs: AtomicWriteFileSystem;
  readonly randomBytes: RandomBytes;
}

const TEMP_TOKEN_BYTES = 8;
const TEMP_SUFFIX = ".tmp";

/**
 * Composes the temporary path for an atomic write of `targetPath` — a sibling of
 * the target (only a suffix is appended, so the directory is unchanged) whose
 * uniqueness token is the hex encoding of the injected random bytes.
 */
export function atomicWriteTempPath(
  targetPath: string,
  randomBytes: RandomBytes,
): string {
  const token = randomBytes(TEMP_TOKEN_BYTES).toString("hex");
  return `${targetPath}.${token}${TEMP_SUFFIX}`;
}

/**
 * Replaces `targetPath` with `content` atomically. Writes a temporary sibling and
 * renames it onto the target; on any failure after the temporary is created, the
 * temporary is removed and the original error propagates.
 */
export async function writeFileAtomic(
  targetPath: string,
  content: string,
  options: AtomicWriteOptions,
): Promise<void> {
  const tempPath = atomicWriteTempPath(targetPath, options.randomBytes);
  try {
    await options.fs.writeFile(tempPath, content);
    await options.fs.rename(tempPath, targetPath);
  } catch (error) {
    try {
      await options.fs.rm(tempPath, { force: true });
    } catch {
      // A cleanup failure must not mask the original write or rename error.
    }
    throw error;
  }
}
