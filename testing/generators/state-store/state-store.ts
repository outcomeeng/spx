import * as fc from "fast-check";

import {
  createStateStoreRunToken,
  type RunRecency,
  slugBranchIdentity,
  STATE_STORE_RUN_TOKEN,
} from "@/lib/state-store";

const SAMPLE_SEED = 0x535458;
const HEX_ALPHABET = [..."0123456789abcdef"] as const;
const BRANCH_SEGMENT_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._/-"] as const;
const TOKEN_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"] as const;

const STATE_STORE_UNSAFE_SCOPE_TOKENS = [".", "..", "a/b", String.raw`a\b`, "a.b"] as const;
const STATE_STORE_UNSAFE_SCOPE_MARKERS = ["/", "\\", ".", ".."] as const;

function stringFromCharacters(
  characters: readonly string[],
  options: { readonly minLength: number; readonly maxLength: number },
): fc.Arbitrary<string> {
  return fc.array(fc.constantFrom(...characters), options).map((chars) => chars.join(""));
}

export const STATE_STORE_TEST_GENERATOR = {
  branchIdentity: (): fc.Arbitrary<string> =>
    stringFromCharacters(BRANCH_SEGMENT_CHARACTERS, { minLength: 1, maxLength: 180 }),
  emptyNormalizedBranchIdentity: (): fc.Arbitrary<string> =>
    fc.string({ minLength: 1, maxLength: 32 }).filter((value) => !/[A-Za-z0-9]/.test(value)),
  headSha: (): fc.Arbitrary<string> => stringFromCharacters(HEX_ALPHABET, { minLength: 40, maxLength: 40 }),
  scopeToken: (): fc.Arbitrary<string> => stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 48 }),
  branchSlug: (): fc.Arbitrary<string> =>
    stringFromCharacters(BRANCH_SEGMENT_CHARACTERS, { minLength: 1, maxLength: 180 }).map(slugBranchIdentity),
  runToken: (): fc.Arbitrary<string> =>
    fc
      .tuple(
        fc.date({
          min: new Date("2026-01-01T00:00:00.000Z"),
          max: new Date("2026-12-31T23:59:59.999Z"),
          noInvalidDate: true,
        }),
        fc.uint8Array({
          minLength: STATE_STORE_RUN_TOKEN.ID_BYTES,
          maxLength: STATE_STORE_RUN_TOKEN.ID_BYTES,
        }).map((bytes) => Buffer.from(bytes)),
      )
      .map(([date, idBytes]) => createStateStoreRunToken({ date, randomBytes: () => idBytes }).runToken),
  unsafeScopeToken: (): fc.Arbitrary<string> => fc.constantFrom(...STATE_STORE_UNSAFE_SCOPE_TOKENS),
  scopeTokenContainingUnsafeMarker: (): fc.Arbitrary<string> =>
    fc
      .tuple(
        stringFromCharacters(TOKEN_CHARACTERS, { minLength: 0, maxLength: 12 }),
        fc.constantFrom(...STATE_STORE_UNSAFE_SCOPE_MARKERS),
        stringFromCharacters(TOKEN_CHARACTERS, { minLength: 0, maxLength: 12 }),
      )
      .map(([prefix, marker, suffix]) => `${prefix}${marker}${suffix}`),
  productRoot: (): fc.Arbitrary<string> =>
    fc.tuple(
      stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 16 }),
      stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 16 }),
    ).map(([first, second]) => `/${first}/${second}`),
  linkedWorktreeRoot: (productRoot: string): fc.Arbitrary<string> =>
    fc.tuple(
      stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 16 }),
      stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 16 }),
    ).map(([group, name]) => `${productRoot}/.${group}/${name}`),
  runDate: (): fc.Arbitrary<Date> =>
    fc.date({
      min: new Date("2026-01-01T00:00:00.000Z"),
      max: new Date("2026-12-31T23:59:59.999Z"),
      noInvalidDate: true,
    }),
  runIdBytes: (): fc.Arbitrary<Buffer> =>
    fc.uint8Array({
      minLength: STATE_STORE_RUN_TOKEN.ID_BYTES,
      maxLength: STATE_STORE_RUN_TOKEN.ID_BYTES,
    }).map((bytes) => Buffer.from(bytes)),
  atomicPublicationFixture: (): fc.Arbitrary<{
    readonly paths: {
      readonly atomicRecord: string;
      readonly prePublicationRecord: string;
      readonly postPublicationRecord: string;
      readonly blockedRecord: string;
      readonly removedTemporaryRecord: string;
      readonly cleanupDestinationPrefix: string;
      readonly firstCleanupTemporary: string;
      readonly secondCleanupTemporary: string;
      readonly cleanupDestination: string;
      readonly nonMatchingTemporary: string;
    };
    readonly content: {
      readonly firstCleanup: string;
      readonly secondCleanup: string;
      readonly destination: string;
      readonly nonMatching: string;
    };
  }> =>
    fc.tuple(
      fc.uniqueArray(
        stringFromCharacters(TOKEN_CHARACTERS, { minLength: 3, maxLength: 16 }),
        { minLength: 14, maxLength: 14 },
      ),
      stringFromCharacters(HEX_ALPHABET, { minLength: 12, maxLength: 12 }),
      stringFromCharacters(HEX_ALPHABET, { minLength: 12, maxLength: 12 }),
    ).map(([tokens, firstTemporaryId, secondTemporaryId]) => {
      const [
        root,
        atomic,
        prePublication,
        postPublication,
        blocked,
        removed,
        cleanup,
        firstCleanup,
        secondCleanup,
        destination,
        nonMatching,
        firstContent,
        secondContent,
        preservedContent,
      ] = tokens as unknown as readonly [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      const cleanupDestinationPrefix = `${root}/${cleanup}-`;
      return {
        paths: {
          atomicRecord: `${root}/${atomic}.jsonl`,
          prePublicationRecord: `${root}/${prePublication}.jsonl`,
          postPublicationRecord: `${root}/${postPublication}.jsonl`,
          blockedRecord: `${root}/${blocked}.jsonl`,
          removedTemporaryRecord: `${root}/${removed}.jsonl`,
          cleanupDestinationPrefix,
          firstCleanupTemporary: `${cleanupDestinationPrefix}${firstCleanup}.jsonl.${firstTemporaryId}.tmp`,
          secondCleanupTemporary: `${cleanupDestinationPrefix}${secondCleanup}.jsonl.${secondTemporaryId}.tmp`,
          cleanupDestination: `${cleanupDestinationPrefix}${destination}.jsonl`,
          nonMatchingTemporary: `${root}/${nonMatching}.jsonl.invalid.tmp`,
        },
        content: {
          firstCleanup: firstContent,
          secondCleanup: secondContent,
          destination: preservedContent,
          nonMatching: nonMatching,
        },
      };
    }),
  // A pair of run-id byte buffers whose hex encodings strictly descend (first greater
  // than second). Assigning the first to an earlier write and the second to a later
  // write makes run-token order disagree with write order, so only a true creation-order
  // signal can resolve the later write as the latest.
  runIdBytesDescendingPair: (): fc.Arbitrary<readonly [Buffer, Buffer]> =>
    fc.tuple(
      fc.uint8Array({ minLength: STATE_STORE_RUN_TOKEN.ID_BYTES, maxLength: STATE_STORE_RUN_TOKEN.ID_BYTES }),
      fc.uint8Array({ minLength: STATE_STORE_RUN_TOKEN.ID_BYTES, maxLength: STATE_STORE_RUN_TOKEN.ID_BYTES }),
    )
      .map(([left, right]) => [Buffer.from(left), Buffer.from(right)] as const)
      .filter(([left, right]) => left.toString("hex") !== right.toString("hex"))
      .map(([left, right]) =>
        left.toString("hex") > right.toString("hex") ? [left, right] as const : [right, left] as const
      ),
  // A run's recency signals, with `startedAt` and `runToken` drawn from one composed
  // run token so the timestamp prefix is a real capture timestamp, and `createdAtMs`
  // an independent filesystem creation time.
  runRecency: (): fc.Arbitrary<RunRecency> =>
    fc.tuple(STATE_STORE_TEST_GENERATOR.runDate(), STATE_STORE_TEST_GENERATOR.runIdBytes(), fc.nat()).map(
      ([date, idBytes, createdAtMs]) => {
        const created = createStateStoreRunToken({ date, randomBytes: () => idBytes });
        return { startedAt: created.startedAt, createdAtMs, runToken: created.runToken };
      },
    ),
  jsonRecordPair: (): fc.Arbitrary<readonly [{ readonly [key: string]: string }, { readonly [key: string]: string }]> =>
    fc.tuple(
      stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 16 }),
      stringFromCharacters(TOKEN_CHARACTERS, { minLength: 1, maxLength: 16 }),
      stringFromCharacters(BRANCH_SEGMENT_CHARACTERS, { minLength: 1, maxLength: 32 }),
      stringFromCharacters(BRANCH_SEGMENT_CHARACTERS, { minLength: 1, maxLength: 32 }),
    ).filter(([firstKey, secondKey, firstValue, secondValue]) => firstKey !== secondKey && firstValue !== secondValue)
      .map(([firstKey, secondKey, firstValue, secondValue]) =>
        [
          { [firstKey]: firstValue },
          { [secondKey]: secondValue },
        ] as const
      ),
} as const;

export type AtomicJsonlPublicationFixture =
  ReturnType<typeof STATE_STORE_TEST_GENERATOR.atomicPublicationFixture> extends fc.Arbitrary<infer Value> ? Value
    : never;

export function sampleStateStoreTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { seed: SAMPLE_SEED, numRuns: 1 });
  if (value === undefined) throw new Error("State-store test generator returned no sample");
  return value;
}
