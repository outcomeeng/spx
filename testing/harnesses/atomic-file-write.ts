/**
 * Recording in-memory filesystem for atomic-file-write tests. Implements the
 * {@link AtomicWriteFileSystem} boundary and captures the operations the
 * primitive performs — the final file contents plus the ordered written,
 * renamed, and removed paths — so a test reads exactly the observability its
 * assertion needs without re-deriving the boundary.
 *
 * @module testing/harnesses/atomic-file-write
 */

import { type AtomicWriteFileSystem, type RandomBytes, writeFileAtomic } from "@/lib/atomic-file-write";
import { type AtomicWriteCollisionInput, sampleAtomicWriteCollisionInput } from "@testing/generators/atomic-file-write";

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
  readonly files: readonly (readonly [string, string])[];
  readonly writeAttempts: readonly string[];
  readonly written: readonly string[];
  readonly renamed: readonly { readonly from: string; readonly to: string }[];
  readonly removed: readonly string[];
  readonly error: Error | undefined;
}

export async function observeAtomicWriteCollisionRetry(): Promise<AtomicWriteCollisionObservation> {
  return observeCollisionRetry(sampleAtomicWriteCollisionInput());
}

export function expectedAtomicWriteCollisionRetry(): AtomicWriteCollisionObservation {
  return expectedCollisionRetry(sampleAtomicWriteCollisionInput());
}

export async function observeAtomicWriteCollisionExhaustion(): Promise<AtomicWriteCollisionObservation> {
  return observeCollisionExhaustion(sampleAtomicWriteCollisionInput());
}

export function expectedAtomicWriteCollisionExhaustion(): AtomicWriteCollisionObservation {
  return expectedCollisionExhaustion(sampleAtomicWriteCollisionInput());
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
  return observationFrom(fs);
}

function expectedCollisionRetry(input: AtomicWriteCollisionInput): AtomicWriteCollisionObservation {
  const temporaryPaths = temporaryPathsFor(input);
  return {
    files: [[temporaryPaths[0], input.collidingContent[0]], [input.targetPath, input.content]],
    writeAttempts: temporaryPaths,
    written: [temporaryPaths[1]],
    renamed: [{ from: temporaryPaths[1], to: input.targetPath }],
    removed: [],
    error: undefined,
  };
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
  return { ...observationFrom(fs), error };
}

function expectedCollisionExhaustion(input: AtomicWriteCollisionInput): AtomicWriteCollisionObservation {
  const temporaryPaths = temporaryPathsFor(input);
  return {
    files: [
      [temporaryPaths[0], input.collidingContent[0]],
      [temporaryPaths[1], input.collidingContent[1]],
    ],
    writeAttempts: temporaryPaths,
    written: [],
    renamed: [],
    removed: [],
    error: new Error("atomic write temporary collision"),
  };
}

function observationFrom(fs: RecordingAtomicWriteFs): AtomicWriteCollisionObservation {
  return {
    files: [...fs.files],
    writeAttempts: fs.writeAttempts,
    written: fs.written,
    renamed: fs.renamed,
    removed: fs.removed,
    error: undefined,
  };
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
