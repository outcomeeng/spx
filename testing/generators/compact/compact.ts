import * as fc from "fast-check";

import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";

const SAMPLE_SEED = 0xC0A7;
const NODE_SEGMENT_CHARACTERS = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"] as const;

function stringFromCharacters(
  characters: readonly string[],
  options: { readonly minLength: number; readonly maxLength: number },
): fc.Arbitrary<string> {
  return fc.array(fc.constantFrom(...characters), options).map((chars) => chars.join(""));
}

function nodeSegment(): fc.Arbitrary<string> {
  return stringFromCharacters(NODE_SEGMENT_CHARACTERS, { minLength: 1, maxLength: 20 });
}

function nodePath(): fc.Arbitrary<string> {
  return fc.array(nodeSegment(), { minLength: 1, maxLength: 4 }).map((segments) => `spx/${segments.join("/")}`);
}

const scopeToken = STATE_STORE_TEST_GENERATOR.scopeToken;

export const COMPACT_TEST_GENERATOR = {
  sessionToken: scopeToken,
  unsafeSessionToken: STATE_STORE_TEST_GENERATOR.scopeTokenContainingUnsafeMarker,
  commitMessage: STATE_STORE_TEST_GENERATOR.branchIdentity,
  nodePath,
  distinctNodePaths: (): fc.Arbitrary<readonly [string, string]> =>
    fc.tuple(nodePath(), nodePath()).filter(([first, second]) => first !== second),
  distinctSessionTokens: (): fc.Arbitrary<readonly [string, string]> =>
    fc.tuple(scopeToken(), scopeToken()).filter(([first, second]) => first !== second),
  transcriptFileName: (): fc.Arbitrary<string> => scopeToken().map((token) => `${token}.jsonl`),
} as const;

export function sampleCompactTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { seed: SAMPLE_SEED, numRuns: 1 });
  if (value === undefined) throw new Error("Compact test generator returned no sample");
  return value;
}
