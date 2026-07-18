import { describe, expect, it } from "vitest";

import { JOURNAL_ERROR, JOURNAL_SEQ_BASE } from "@/lib/agent-run-journal";
import { journalEventFromInput } from "@testing/generators/agent-run-journal";
import {
  APPENDABLE_JOURNAL_INTERRUPTION_ERROR,
  APPENDABLE_JOURNAL_INTERRUPTION_EXIT_CODE,
  appendableJournalInterruptionObservation,
} from "@testing/harnesses/state/appendable-journal-store";

describe("appendable journal store — process interruption", () => {
  it("recovers on the correct side of the atomic sequence publication boundary", async () => {
    await appendableJournalInterruptionObservation().then(({ actual, firstInput, identity, nextInput }) => {
      expect(actual.prePublication.exitCode).toBe(APPENDABLE_JOURNAL_INTERRUPTION_EXIT_CODE.PRE_PUBLICATION);
      expect(actual.prePublication.appendedSequence).toBe(JOURNAL_SEQ_BASE);
      expect(actual.prePublication.replay).toEqual([
        journalEventFromInput(firstInput, identity, JOURNAL_SEQ_BASE),
      ]);
      expect(actual.postPublication.exitCode).toBe(APPENDABLE_JOURNAL_INTERRUPTION_EXIT_CODE.POST_PUBLICATION);
      expect(actual.postPublication.replay).toEqual([
        journalEventFromInput(firstInput, identity, JOURNAL_SEQ_BASE),
      ]);
      expect(actual.postPublication.nextSequence).toBe(JOURNAL_SEQ_BASE + 1);
      expect(actual.aggregateSeal.sealError).toBe(APPENDABLE_JOURNAL_INTERRUPTION_ERROR.AGGREGATE_SEAL);
      expect(actual.aggregateSeal.sealedAfterInterruption).toBe(false);
      expect(actual.aggregateSeal.replayAfterInterruption).toEqual([
        journalEventFromInput(firstInput, identity, JOURNAL_SEQ_BASE),
        journalEventFromInput(nextInput, identity, JOURNAL_SEQ_BASE + 1),
      ]);
      expect(actual.aggregateSeal.hydratedReplay).toEqual([
        journalEventFromInput(firstInput, identity, JOURNAL_SEQ_BASE),
        journalEventFromInput(nextInput, identity, JOURNAL_SEQ_BASE + 1),
      ]);
      expect(actual.aggregateSeal.unsealedAggregateReplay).toEqual([]);
      expect(actual.staleBarrier.sealError).toBe(APPENDABLE_JOURNAL_INTERRUPTION_ERROR.SEALING_BARRIER);
      expect(actual.staleBarrier.sealedAfterInterruption).toBe(false);
      expect(actual.staleBarrier.appendError).toBe(JOURNAL_ERROR.SEALED);
      expect(actual.staleBarrier.hydratedReplay).toEqual([
        journalEventFromInput(firstInput, identity, JOURNAL_SEQ_BASE),
        journalEventFromInput(nextInput, identity, JOURNAL_SEQ_BASE + 1),
      ]);
    });
  });
});
