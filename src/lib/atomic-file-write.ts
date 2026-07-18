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
  writeFile(path: string, data: string, options?: { readonly flag?: string }): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string, options: { readonly force: true }): Promise<void>;
}

/** Source of cryptographic random bytes for the temporary-name suffix. */
export type RandomBytes = (size: number) => Buffer;

/** Caller-owned temporary-path shape over the target and injected random source. */
export type AtomicWriteTemporaryPath = (targetPath: string, randomBytes: RandomBytes) => string;

export interface AtomicWriteExclusiveCreatePolicy {
  readonly maxAttempts: number;
  readonly isCollision: (error: unknown) => boolean;
}

export interface AtomicWriteOptions {
  readonly fs: AtomicWriteFileSystem;
  readonly randomBytes: RandomBytes;
  readonly temporaryPath?: AtomicWriteTemporaryPath;
  readonly exclusiveCreate?: AtomicWriteExclusiveCreatePolicy;
}

const TEMP_TOKEN_BYTES = 8;
const TEMP_SUFFIX = ".tmp";
const EXCLUSIVE_CREATE_FLAG = "wx";
const NO_TEMPORARY_ATTEMPTS_ERROR = "Atomic file replacement requires at least one temporary-file attempt";

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
  const temporaryPath = options.temporaryPath ?? atomicWriteTempPath;
  const maxAttempts = options.exclusiveCreate?.maxAttempts ?? 1;
  let finalCollision: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const tempPath = temporaryPath(targetPath, options.randomBytes);
    try {
      await options.fs.writeFile(
        tempPath,
        content,
        options.exclusiveCreate === undefined ? undefined : { flag: EXCLUSIVE_CREATE_FLAG },
      );
    } catch (error) {
      if (options.exclusiveCreate?.isCollision(error) === true) {
        finalCollision = error;
        continue;
      }
      await removeTemporaryFileBestEffort(options.fs, tempPath);
      throw error;
    }

    try {
      await options.fs.rename(tempPath, targetPath);
      return;
    } catch (error) {
      await removeTemporaryFileBestEffort(options.fs, tempPath);
      throw error;
    }
  }

  if (finalCollision !== undefined) throw finalCollision;
  throw new Error(NO_TEMPORARY_ATTEMPTS_ERROR);
}

async function removeTemporaryFileBestEffort(fs: AtomicWriteFileSystem, tempPath: string): Promise<void> {
  try {
    await fs.rm(tempPath, { force: true });
  } catch {
    // A cleanup failure must not mask the original write or rename error.
  }
}
