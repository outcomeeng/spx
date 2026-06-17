import fc from "fast-check";

import { createStateStoreRunToken } from "@/lib/state-store";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";

export const arbitraryProjection = (): fc.Arbitrary<string> => fc.string();
export const arbitraryProjectionHistory = (): fc.Arbitrary<readonly string[]> => fc.array(arbitraryProjection(), {
  minLength: 1,
});
export const arbitrarySnapshotMarker = (): fc.Arbitrary<string> => fc.string({ minLength: 1 });
export const arbitraryPullNumber = (): fc.Arbitrary<number> => fc.integer({ min: 1 });

export const arbitraryRunToken = (): fc.Arbitrary<string> =>
  fc.tuple(STATE_STORE_TEST_GENERATOR.runDate(), STATE_STORE_TEST_GENERATOR.runIdBytes()).map(([date, bytes]) =>
    createStateStoreRunToken({ date, randomBytes: (size) => Buffer.from(bytes.subarray(0, size)) }).runToken
  );
