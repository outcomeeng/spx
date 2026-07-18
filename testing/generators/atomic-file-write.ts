import * as fc from "fast-check";

const SAMPLE_SEED = 0x415457;
const PATH_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"] as const;
const TEMPORARY_BYTE_COUNT = 8;

function pathSegment(): fc.Arbitrary<string> {
  return fc.array(fc.constantFrom(...PATH_CHARACTERS), { minLength: 3, maxLength: 16 })
    .map((characters) => characters.join(""));
}

function targetPath(): fc.Arbitrary<string> {
  return fc.tuple(fc.array(pathSegment(), { minLength: 1, maxLength: 4 }), pathSegment())
    .map(([directories, basename]) => `/${[...directories, `${basename}.json`].join("/")}`);
}

function temporaryBytes(): fc.Arbitrary<Uint8Array> {
  return fc.uint8Array({ minLength: TEMPORARY_BYTE_COUNT, maxLength: TEMPORARY_BYTE_COUNT });
}

export interface AtomicWriteInput {
  readonly targetPath: string;
  readonly content: string;
  readonly temporaryBytes: Uint8Array;
  readonly failureMessage: string;
}

export interface AtomicWriteDistinctTemporaryInput {
  readonly targetPath: string;
  readonly temporaryBytes: readonly [Uint8Array, Uint8Array];
}

export interface AtomicWriteCollisionInput {
  readonly targetPath: string;
  readonly content: string;
  readonly collidingContent: readonly [string, string];
  readonly temporaryMarker: string;
  readonly temporaryBytes: readonly [Uint8Array, Uint8Array];
}

export const ATOMIC_FILE_WRITE_TEST_GENERATOR = {
  writeInput: (): fc.Arbitrary<AtomicWriteInput> =>
    fc.record({
      targetPath: targetPath(),
      content: fc.string({ minLength: 1, maxLength: 64 }),
      temporaryBytes: temporaryBytes(),
      failureMessage: fc.string({ minLength: 1, maxLength: 64 }),
    }),
  distinctTemporaryInput: (): fc.Arbitrary<AtomicWriteDistinctTemporaryInput> =>
    fc.tuple(targetPath(), temporaryBytes(), temporaryBytes())
      .filter(([, first, second]) => Buffer.compare(Buffer.from(first), Buffer.from(second)) !== 0)
      .map(([generatedTargetPath, first, second]) => ({
        targetPath: generatedTargetPath,
        temporaryBytes: [first, second],
      })),
};

export function arbitraryAtomicWriteCollisionInput(): fc.Arbitrary<AtomicWriteCollisionInput> {
  return fc.tuple(
    fc.uniqueArray(pathSegment(), { minLength: 3, maxLength: 3 }),
    fc.string({ minLength: 1, maxLength: 64 }),
    fc.string({ minLength: 1, maxLength: 64 }),
    fc.string({ minLength: 1, maxLength: 64 }),
    temporaryBytes(),
    temporaryBytes(),
  )
    .filter(([, , , , firstBytes, secondBytes]) =>
      Buffer.compare(Buffer.from(firstBytes), Buffer.from(secondBytes)) !== 0
    )
    .map(([[root, target, marker], content, firstCollision, secondCollision, firstBytes, secondBytes]) => ({
      targetPath: `/${root}/${target}.json`,
      content,
      collidingContent: [firstCollision, secondCollision],
      temporaryMarker: marker,
      temporaryBytes: [firstBytes, secondBytes],
    }));
}

export function sampleAtomicWriteInput(): AtomicWriteInput {
  const [input] = fc.sample(ATOMIC_FILE_WRITE_TEST_GENERATOR.writeInput(), { seed: SAMPLE_SEED, numRuns: 1 });
  return input;
}

export function sampleAtomicWriteCollisionInput(): AtomicWriteCollisionInput {
  const [input] = fc.sample(arbitraryAtomicWriteCollisionInput(), { seed: SAMPLE_SEED, numRuns: 1 });
  return input;
}
