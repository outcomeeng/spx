import * as fc from "fast-check";

import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";

export interface SameMillisecondRunCreationInputs {
  readonly date: Date;
  readonly firstIdBytes: Buffer;
  readonly secondIdBytes: Buffer;
}

export function arbitrarySameMillisecondRunCreationInputs(): fc.Arbitrary<SameMillisecondRunCreationInputs> {
  return fc
    .tuple(
      STATE_STORE_TEST_GENERATOR.runDate(),
      STATE_STORE_TEST_GENERATOR.runIdBytesDescendingPair(),
    )
    .map(([date, [firstIdBytes, secondIdBytes]]) => ({ date, firstIdBytes, secondIdBytes }));
}
