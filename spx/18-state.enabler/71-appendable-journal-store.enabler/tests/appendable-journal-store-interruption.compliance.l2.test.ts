import { describe, expect, it } from "vitest";

import { appendableJournalInterruptionObservation } from "@testing/harnesses/state/appendable-journal-store";

describe("appendable journal store — process interruption", () => {
  it("recovers on the correct side of the atomic sequence publication boundary", async () => {
    expect((await appendableJournalInterruptionObservation()).actual.prePublication.exitCode).toEqual(
      (await appendableJournalInterruptionObservation()).expected.prePublication.exitCode,
    );
    expect((await appendableJournalInterruptionObservation()).actual.prePublication.appendedSequence).toEqual(
      (await appendableJournalInterruptionObservation()).expected.prePublication.appendedSequence,
    );
    expect((await appendableJournalInterruptionObservation()).actual.prePublication.replay).toEqual(
      (await appendableJournalInterruptionObservation()).expected.prePublication.replay,
    );
    expect((await appendableJournalInterruptionObservation()).actual.postPublication.exitCode).toEqual(
      (await appendableJournalInterruptionObservation()).expected.postPublication.exitCode,
    );
    expect((await appendableJournalInterruptionObservation()).actual.postPublication.replay).toEqual(
      (await appendableJournalInterruptionObservation()).expected.postPublication.replay,
    );
    expect((await appendableJournalInterruptionObservation()).actual.postPublication.nextSequence).toEqual(
      (await appendableJournalInterruptionObservation()).expected.postPublication.nextSequence,
    );
    expect((await appendableJournalInterruptionObservation()).actual.aggregateSeal.sealError).toEqual(
      (await appendableJournalInterruptionObservation()).expected.aggregateSeal.sealError,
    );
    expect((await appendableJournalInterruptionObservation()).actual.aggregateSeal.sealedAfterInterruption).toEqual(
      (await appendableJournalInterruptionObservation()).expected.aggregateSeal.sealedAfterInterruption,
    );
    expect((await appendableJournalInterruptionObservation()).actual.aggregateSeal.replayAfterInterruption).toEqual(
      (await appendableJournalInterruptionObservation()).expected.aggregateSeal.replayAfterInterruption,
    );
    expect((await appendableJournalInterruptionObservation()).actual.aggregateSeal.hydratedReplay).toEqual(
      (await appendableJournalInterruptionObservation()).expected.aggregateSeal.hydratedReplay,
    );
    expect((await appendableJournalInterruptionObservation()).actual.aggregateSeal.unsealedAggregateReplay).toEqual(
      (await appendableJournalInterruptionObservation()).expected.aggregateSeal.unsealedAggregateReplay,
    );
    expect((await appendableJournalInterruptionObservation()).actual.staleBarrier.sealError).toEqual(
      (await appendableJournalInterruptionObservation()).expected.staleBarrier.sealError,
    );
    expect((await appendableJournalInterruptionObservation()).actual.staleBarrier.sealedAfterInterruption).toEqual(
      (await appendableJournalInterruptionObservation()).expected.staleBarrier.sealedAfterInterruption,
    );
    expect((await appendableJournalInterruptionObservation()).actual.staleBarrier.appendError).toEqual(
      (await appendableJournalInterruptionObservation()).expected.staleBarrier.appendError,
    );
    expect((await appendableJournalInterruptionObservation()).actual.staleBarrier.hydratedReplay).toEqual(
      (await appendableJournalInterruptionObservation()).expected.staleBarrier.hydratedReplay,
    );
  });
});
