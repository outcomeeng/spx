/**
 * Recording in-memory filesystem for atomic-file-write tests. Implements the
 * {@link AtomicWriteFileSystem} boundary and captures the operations the
 * primitive performs — the final file contents plus the ordered written,
 * renamed, and removed paths — so a test reads exactly the observability its
 * assertion needs without re-deriving the boundary.
 *
 * @module testing/harnesses/atomic-file-write
 */

import {
  type AtomicWriteFileSystem,
  atomicWriteTempPath,
  type RandomBytes,
  writeFileAtomic,
} from "@/lib/atomic-file-write";
import {
  type AtomicWriteCollisionInput,
  sampleAtomicWriteCollisionInput,
  sampleAtomicWriteInput,
} from "@testing/generators/atomic-file-write";

interface RecordingAtomicWriteOptions {
  readonly collisionError?: Error;
  readonly initialFiles?: ReadonlyMap<string, string>;
}

export interface RecordingAtomicWriteFs extends AtomicWriteFileSystem {
  readonly files: Map<string, string>;
  readonly writeAttempts: string[];
  readonly written: string[];
  readonly renamed: Array<{ from: string; to: string }>;
  readonly removed: string[];
}

export function createRecordingAtomicWriteFs(options: RecordingAtomicWriteOptions = {}): RecordingAtomicWriteFs {
  const files = new Map(options.initialFiles);
  const writeAttempts: string[] = [];
  const written: string[] = [];
  const renamed: Array<{ from: string; to: string }> = [];
  const removed: string[] = [];
  return {
    files,
    writeAttempts,
    written,
    renamed,
    removed,
    async writeFile(path, data, writeOptions) {
      writeAttempts.push(path);
      if (writeOptions?.flag !== undefined && files.has(path)) {
        throw options.collisionError ?? new Error(`temporary path exists: ${path}`);
      }
      written.push(path);
      files.set(path, data);
    },
    async rename(from, to) {
      renamed.push({ from, to });
      const data = files.get(from);
      if (data === undefined) {
        throw new Error(`rename ENOENT: no such file '${from}'`);
      }
      files.set(to, data);
      files.delete(from);
    },
    async rm(path) {
      removed.push(path);
      files.delete(path);
    },
  };
}

export interface AtomicWriteCollisionObservation {
  readonly collisionError: Error;
  readonly input: AtomicWriteCollisionInput;
  readonly temporaryPaths: readonly [string, string];
  readonly files: readonly (readonly [string, string])[];
  readonly writeAttempts: readonly string[];
  readonly written: readonly string[];
  readonly renamed: readonly { readonly from: string; readonly to: string }[];
  readonly removed: readonly string[];
  readonly error: Error | undefined;
}

export interface AtomicWriteScenarioObservation {
  readonly content: string;
  readonly error: Error | undefined;
  readonly files: readonly (readonly [string, string])[];
  readonly removed: readonly string[];
  readonly targetPath: string;
  readonly temporaryPath: string;
  readonly thrown: Error | undefined;
}

export function fixedAtomicWriteRandomBytes(bytes: Uint8Array): RandomBytes {
  return () => Buffer.from(bytes);
}

export async function observeAtomicWriteSuccess(): Promise<AtomicWriteScenarioObservation> {
  const input = sampleAtomicWriteInput();
  const randomBytes = fixedAtomicWriteRandomBytes(input.temporaryBytes);
  const temporaryPath = atomicWriteTempPath(input.targetPath, randomBytes);
  const fs = createRecordingAtomicWriteFs();
  let thrown: Error | undefined;
  try {
    await writeFileAtomic(input.targetPath, input.content, { fs, randomBytes });
  } catch (cause) {
    thrown = cause instanceof Error ? cause : new Error(String(cause));
  }
  return scenarioObservation(input.targetPath, input.content, temporaryPath, fs, undefined, thrown);
}

export async function observeAtomicWriteRenameFailure(): Promise<AtomicWriteScenarioObservation> {
  const input = sampleAtomicWriteInput();
  const error = new Error(input.failureMessage);
  const randomBytes = fixedAtomicWriteRandomBytes(input.temporaryBytes);
  const temporaryPath = atomicWriteTempPath(input.targetPath, randomBytes);
  const fs: RecordingAtomicWriteFs = {
    ...createRecordingAtomicWriteFs(),
    rename: () => Promise.reject(error),
  };
  return observeAtomicWriteFailure(input.targetPath, input.content, temporaryPath, randomBytes, fs, error);
}

export async function observeAtomicWriteWriteFailure(): Promise<AtomicWriteScenarioObservation> {
  const input = sampleAtomicWriteInput();
  const error = new Error(input.failureMessage);
  const randomBytes = fixedAtomicWriteRandomBytes(input.temporaryBytes);
  const temporaryPath = atomicWriteTempPath(input.targetPath, randomBytes);
  const base = createRecordingAtomicWriteFs();
  const fs: RecordingAtomicWriteFs = {
    ...base,
    writeFile: (path, data) => {
      base.files.set(path, data);
      return Promise.reject(error);
    },
  };
  return observeAtomicWriteFailure(input.targetPath, input.content, temporaryPath, randomBytes, fs, error);
}

export async function observeAtomicWriteCollisionRetry(): Promise<AtomicWriteCollisionObservation> {
  return observeCollisionRetry(sampleAtomicWriteCollisionInput());
}

export async function observeAtomicWriteCollisionExhaustion(): Promise<AtomicWriteCollisionObservation> {
  return observeCollisionExhaustion(sampleAtomicWriteCollisionInput());
}

async function observeCollisionRetry(input: AtomicWriteCollisionInput): Promise<AtomicWriteCollisionObservation> {
  const collisionError = new Error("atomic write temporary collision");
  const temporaryPaths = temporaryPathsFor(input);
  const fs = createRecordingAtomicWriteFs({
    collisionError,
    initialFiles: new Map([[temporaryPaths[0], input.collidingContent[0]]]),
  });
  await writeFileAtomic(input.targetPath, input.content, {
    fs,
    randomBytes: sequentialRandomBytes(input.temporaryBytes),
    temporaryPath: markedTemporaryPath(input.temporaryMarker),
    exclusiveCreate: { maxAttempts: input.temporaryBytes.length, isCollision: (error) => error === collisionError },
  });
  return collisionObservation(input, temporaryPaths, collisionError, fs, undefined);
}

async function observeCollisionExhaustion(input: AtomicWriteCollisionInput): Promise<AtomicWriteCollisionObservation> {
  const collisionError = new Error("atomic write temporary collision");
  const temporaryPaths = temporaryPathsFor(input);
  const fs = createRecordingAtomicWriteFs({
    collisionError,
    initialFiles: new Map([
      [temporaryPaths[0], input.collidingContent[0]],
      [temporaryPaths[1], input.collidingContent[1]],
    ]),
  });
  let error: Error | undefined;
  try {
    await writeFileAtomic(input.targetPath, input.content, {
      fs,
      randomBytes: sequentialRandomBytes(input.temporaryBytes),
      temporaryPath: markedTemporaryPath(input.temporaryMarker),
      exclusiveCreate: { maxAttempts: input.temporaryBytes.length, isCollision: (cause) => cause === collisionError },
    });
  } catch (cause) {
    error = cause instanceof Error ? cause : new Error(String(cause));
  }
  return collisionObservation(input, temporaryPaths, collisionError, fs, error);
}

function collisionObservation(
  input: AtomicWriteCollisionInput,
  temporaryPaths: readonly [string, string],
  collisionError: Error,
  fs: RecordingAtomicWriteFs,
  error: Error | undefined,
): AtomicWriteCollisionObservation {
  return {
    collisionError,
    input,
    temporaryPaths,
    files: [...fs.files],
    writeAttempts: fs.writeAttempts,
    written: fs.written,
    renamed: fs.renamed,
    removed: fs.removed,
    error,
  };
}

async function observeAtomicWriteFailure(
  targetPath: string,
  content: string,
  temporaryPath: string,
  randomBytes: RandomBytes,
  fs: RecordingAtomicWriteFs,
  error: Error,
): Promise<AtomicWriteScenarioObservation> {
  let thrown: Error | undefined;
  try {
    await writeFileAtomic(targetPath, content, { fs, randomBytes });
  } catch (cause) {
    thrown = cause instanceof Error ? cause : new Error(String(cause));
  }
  return scenarioObservation(targetPath, content, temporaryPath, fs, error, thrown);
}

function scenarioObservation(
  targetPath: string,
  content: string,
  temporaryPath: string,
  fs: RecordingAtomicWriteFs,
  error: Error | undefined,
  thrown: Error | undefined,
): AtomicWriteScenarioObservation {
  return { targetPath, content, temporaryPath, files: [...fs.files], removed: fs.removed, error, thrown };
}

function temporaryPathsFor(input: AtomicWriteCollisionInput): readonly [string, string] {
  return [
    markedTemporaryPath(input.temporaryMarker)(input.targetPath, () => Buffer.from(input.temporaryBytes[0])),
    markedTemporaryPath(input.temporaryMarker)(input.targetPath, () => Buffer.from(input.temporaryBytes[1])),
  ];
}

function markedTemporaryPath(marker: string): (targetPath: string, randomBytes: RandomBytes) => string {
  return (targetPath, randomBytes) => `${targetPath}.${marker}.${randomBytes(8).toString("hex")}.tmp`;
}

function sequentialRandomBytes(values: readonly [Uint8Array, Uint8Array]): RandomBytes {
  let index = 0;
  return () => {
    const value = values.at(index);
    index += 1;
    if (value === undefined) throw new Error("Atomic-write random-byte sequence exhausted");
    return Buffer.from(value);
  };
}
