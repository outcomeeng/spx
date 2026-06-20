import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  foldJournalRunState,
  JOURNAL_RUN_STATE_INCOMPLETE_REASON,
  type JournalRunState,
} from "@/domains/journal/run-state";
import { JOURNAL_RUN_STATE_TEST_GENERATOR } from "@testing/generators/journal/run-state";

function stateWithEvents(): fc.Arbitrary<{
  readonly state: JournalRunState;
  readonly events: ReturnType<typeof JOURNAL_RUN_STATE_TEST_GENERATOR.completedEvent>[];
}> {
  return JOURNAL_RUN_STATE_TEST_GENERATOR.journalRunState().chain((state) =>
    JOURNAL_RUN_STATE_TEST_GENERATOR.runEvents([state]).map((events) => ({ state, events: [...events] }))
  );
}

describe("journal run-state fold", () => {
  it("folds a sealed run's terminal-completion event into the run-state envelope", () => {
    fc.assert(
      fc.property(stateWithEvents(), ({ state, events }) => {
        const result = foldJournalRunState(events, true);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toEqual(state);
      }),
    );
  });

  it("treats a sealed run with no terminal-completion event as missing state", () => {
    fc.assert(
      fc.property(JOURNAL_RUN_STATE_TEST_GENERATOR.nonCompletedEvents(), (events) => {
        expect(foldJournalRunState(events, true)).toEqual({
          ok: false,
          reason: JOURNAL_RUN_STATE_INCOMPLETE_REASON.MISSING_STATE,
        });
      }),
    );
  });

  it("treats an unsealed run as incomplete even when it holds a terminal-completion event", () => {
    fc.assert(
      fc.property(stateWithEvents(), ({ events }) => {
        expect(foldJournalRunState(events, false)).toEqual({
          ok: false,
          reason: JOURNAL_RUN_STATE_INCOMPLETE_REASON.UNSEALED,
        });
      }),
    );
  });

  it("treats a terminal-completion event with an invalid payload as shape-invalid", () => {
    fc.assert(
      fc.property(JOURNAL_RUN_STATE_TEST_GENERATOR.invalidCompletedEvents(), (events) => {
        const result = foldJournalRunState(events, true);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe(JOURNAL_RUN_STATE_INCOMPLETE_REASON.SHAPE_INVALID_STATE);
      }),
    );
  });

  it("folds the latest terminal-completion event when several are present", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          JOURNAL_RUN_STATE_TEST_GENERATOR.journalRunState(),
          JOURNAL_RUN_STATE_TEST_GENERATOR.journalRunState(),
        ).chain(([earlier, latest]) =>
          JOURNAL_RUN_STATE_TEST_GENERATOR.runEvents([earlier, latest]).map((events) => ({ latest, events }))
        ),
        ({ latest, events }) => {
          const result = foldJournalRunState(events, true);

          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(result.value).toEqual(latest);
        },
      ),
    );
  });
});
