import * as fc from "fast-check";

const SAMPLE_SEED = 0x415457;
const PATH_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"] as const;

function pathSegment(): fc.Arbitrary<string> {
  return fc.array(fc.constantFrom(...PATH_CHARACTERS), { minLength: 3, maxLength: 16 })
    .map((characters) => characters.join(""));
}

export interface AtomicWriteCollisionInput {
  readonly targetPath: string;
  readonly content: string;
  readonly collidingContent: readonly [string, string];
  readonly temporaryMarker: string;
  readonly temporaryBytes: readonly [Uint8Array, Uint8Array];
}

export function arbitraryAtomicWriteCollisionInput(): fc.Arbitrary<AtomicWriteCollisionInput> {
  return fc.tuple(
    fc.uniqueArray(pathSegment(), { minLength: 3, maxLength: 3 }),
    fc.string({ minLength: 1, maxLength: 64 }),
    fc.string({ minLength: 1, maxLength: 64 }),
    fc.string({ minLength: 1, maxLength: 64 }),
    fc.uint8Array({ minLength: 8, maxLength: 8 }),
    fc.uint8Array({ minLength: 8, maxLength: 8 }),
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

export function sampleAtomicWriteCollisionInput(): AtomicWriteCollisionInput {
  const [input] = fc.sample(arbitraryAtomicWriteCollisionInput(), { seed: SAMPLE_SEED, numRuns: 1 });
  if (input === undefined) throw new Error("Atomic-write collision generator returned no sample");
  return input;
}
