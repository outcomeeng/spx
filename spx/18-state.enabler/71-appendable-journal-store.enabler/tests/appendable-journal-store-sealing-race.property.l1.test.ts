import { isDeepStrictEqual } from "node:util";

import fc from "fast-check";
import { describe, it } from "vitest";

import { createJournal, JOURNAL_ERROR, type JournalEventInput, type JournalIdentity } from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import { arbitraryJournalEventInput, arbitraryJournalIdentity } from "@testing/generators/agent-run-journal";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  createPublicationWinningSealFileSystem,
  isFulfilledOutcome,
  prepareSealingRace,
  readHydratedReplay,
  rejectedOutcomeMessage,
} from "@testing/harnesses/state/appendable-journal-store";

describe("appendable journal store — append and seal race property", () => {
  it("includes every successful append in the sealed aggregate", async () => {
    await assertProperty(
      fc.tuple(
        arbitraryJournalEventInput(),
        arbitraryJournalEventInput(),
        arbitraryJournalIdentity(),
      ),
      async ([firstInput, secondInput, identity]: readonly [
        JournalEventInput,
        JournalEventInput,
        JournalIdentity,
      ]): Promise<boolean> =>
        (await sealingBarrierWins(identity, firstInput, secondInput))
        && (await appendPublicationWins(identity, firstInput, secondInput)),
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});

async function sealingBarrierWins(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
  secondInput: JournalEventInput,
): Promise<boolean> {
  const race = await prepareSealingRace(identity, firstInput, secondInput);
  await createJournal(
    createAppendableJournalStore({ runFilePath: race.runFilePath, fs: race.base }),
    identity,
  ).seal();
  race.releaseAppendPublication();
  const appendOutcome = await race.appendOutcomePromise;
  const hydratedReplay = await readHydratedReplay(race.base, race.runFilePath);
  return isFulfilledOutcome(appendOutcome)
    ? isDeepStrictEqual(hydratedReplay, [race.first, appendOutcome.value])
    : rejectedOutcomeMessage(appendOutcome) === JOURNAL_ERROR.SEALED
      && isDeepStrictEqual(hydratedReplay, [race.first]);
}

async function appendPublicationWins(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
  secondInput: JournalEventInput,
): Promise<boolean> {
  const race = await prepareSealingRace(identity, firstInput, secondInput);
  const sealingFileSystem = createPublicationWinningSealFileSystem(race);
  await createJournal(
    createAppendableJournalStore({ runFilePath: race.runFilePath, fs: sealingFileSystem }),
    identity,
  ).seal();
  const appendOutcome = await race.appendOutcomePromise;
  return isFulfilledOutcome(appendOutcome)
    && isDeepStrictEqual(
      await readHydratedReplay(race.base, race.runFilePath),
      [race.first, appendOutcome.value],
    );
}
