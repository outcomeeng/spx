import { isDeepStrictEqual } from "node:util";

import { describe, it } from "vitest";

import { JOURNAL_ERROR } from "@/lib/agent-run-journal";
import { arbitraryJournalPairInput } from "@testing/generators/agent-run-journal";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  observeAppendableJournalSealingRace,
  observeOverlappingSeals,
} from "@testing/harnesses/state/appendable-journal-store";

describe("appendable journal store — append and seal race property", () => {
  it("includes every successful append in the sealed aggregate", async () => {
    await assertProperty(
      arbitraryJournalPairInput(),
      async ({ firstInput, secondInput, identity }) => {
        const observation = await observeAppendableJournalSealingRace(identity, firstInput, secondInput);
        const barrier = observation.sealingBarrier;
        const publication = observation.appendPublication;
        return (barrier.appended === undefined
          ? barrier.appendError === JOURNAL_ERROR.SEALED
            && isDeepStrictEqual(barrier.hydratedReplay, [barrier.first])
          : isDeepStrictEqual(barrier.hydratedReplay, [barrier.first, barrier.appended]))
          && publication.appended !== undefined
          && isDeepStrictEqual(publication.hydratedReplay, [publication.first, publication.appended]);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("preserves each live aggregate temporary while seals overlap", async () => {
    await assertProperty(
      arbitraryJournalPairInput(),
      async ({ firstInput, secondInput, identity }) => {
        const observation = await observeOverlappingSeals(identity, firstInput, secondInput);
        return observation.fulfilledCount === 2
          && isDeepStrictEqual(observation.replayAfterSecondSeal, [
            observation.first,
            observation.second,
          ])
          && isDeepStrictEqual(observation.replayAfterFirstSeal, [
            observation.first,
            observation.second,
          ]);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
