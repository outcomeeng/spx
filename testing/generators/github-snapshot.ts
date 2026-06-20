import fc from "fast-check";

import { createStateStoreRunToken } from "@/lib/state-store";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";

export const arbitraryProjection = (): fc.Arbitrary<string> => fc.string();
export const arbitraryProjectionHistory = (): fc.Arbitrary<readonly string[]> =>
  fc.array(arbitraryProjection(), {
    minLength: 1,
  });
export const arbitrarySnapshotMarker = (): fc.Arbitrary<string> => fc.string({ minLength: 1 });
export const arbitraryPullNumber = (): fc.Arbitrary<number> => fc.integer({ min: 1 });

export const arbitraryRunToken = (): fc.Arbitrary<string> =>
  fc.tuple(STATE_STORE_TEST_GENERATOR.runDate(), STATE_STORE_TEST_GENERATOR.runIdBytes()).map(([date, bytes]) =>
    createStateStoreRunToken({ date, randomBytes: (size) => Buffer.from(bytes.subarray(0, size)) }).runToken
  );

const GITHUB_SNAPSHOT_SAMPLE_SEED = 0x67687362;

/** Draw one deterministic value from a github-snapshot arbitrary. */
export function sampleGithubSnapshotValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { seed: GITHUB_SNAPSHOT_SAMPLE_SEED, numRuns: 1 });
  if (value === undefined) throw new Error("github-snapshot test generator returned no sample");
  return value;
}
