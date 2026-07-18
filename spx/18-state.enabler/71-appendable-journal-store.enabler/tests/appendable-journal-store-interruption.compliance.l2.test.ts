import { describe, expect, it } from "vitest";

import {
  CLOUDEVENTS_SPECVERSION,
  JOURNAL_ERROR,
  JOURNAL_SEQ_BASE,
  type JournalEvent,
  type JournalEventInput,
  type JournalIdentity,
} from "@/lib/agent-run-journal";
import {
  APPENDABLE_JOURNAL_INTERRUPTION_ERROR,
  APPENDABLE_JOURNAL_INTERRUPTION_EXIT_CODE,
  appendableJournalInterruptionObservation,
} from "@testing/harnesses/state/appendable-journal-store";

describe("appendable journal store — process interruption", () => {
  it("recovers on the correct side of the atomic sequence publication boundary", async () => {
    const observation = await appendableJournalInterruptionObservation();
    const first = expectedEvent(observation.firstInput, observation.identity, JOURNAL_SEQ_BASE);
    const next = expectedEvent(observation.nextInput, observation.identity, JOURNAL_SEQ_BASE + 1);

    expect(observation.actual.prePublication.exitCode).toBe(
      APPENDABLE_JOURNAL_INTERRUPTION_EXIT_CODE.PRE_PUBLICATION,
    );
    expect(observation.actual.prePublication.appendedSequence).toBe(JOURNAL_SEQ_BASE);
    expect(observation.actual.prePublication.replay).toEqual([first]);
    expect(observation.actual.postPublication.exitCode).toBe(
      APPENDABLE_JOURNAL_INTERRUPTION_EXIT_CODE.POST_PUBLICATION,
    );
    expect(observation.actual.postPublication.replay).toEqual([first]);
    expect(observation.actual.postPublication.nextSequence).toBe(JOURNAL_SEQ_BASE + 1);
    expect(observation.actual.aggregateSeal.sealError).toBe(
      APPENDABLE_JOURNAL_INTERRUPTION_ERROR.AGGREGATE_SEAL,
    );
    expect(observation.actual.aggregateSeal.sealedAfterInterruption).toBe(false);
    expect(observation.actual.aggregateSeal.replayAfterInterruption).toEqual([first, next]);
    expect(observation.actual.aggregateSeal.hydratedReplay).toEqual([first, next]);
    expect(observation.actual.aggregateSeal.unsealedAggregateReplay).toEqual([]);
    expect(observation.actual.staleBarrier.sealError).toBe(
      APPENDABLE_JOURNAL_INTERRUPTION_ERROR.SEALING_BARRIER,
    );
    expect(observation.actual.staleBarrier.sealedAfterInterruption).toBe(false);
    expect(observation.actual.staleBarrier.appendError).toBe(JOURNAL_ERROR.SEALED);
    expect(observation.actual.staleBarrier.hydratedReplay).toEqual([first, next]);
  });
});

function expectedEvent(
  input: JournalEventInput,
  identity: JournalIdentity,
  sequence: number,
): JournalEvent {
  return {
    id: input.id,
    source: input.source,
    type: input.type,
    specversion: CLOUDEVENTS_SPECVERSION,
    time: input.time,
    streamid: identity.streamid,
    seq: sequence,
    runid: identity.runid,
    attempt: input.attempt,
    ...(input.data === undefined ? {} : { data: input.data }),
  };
}
