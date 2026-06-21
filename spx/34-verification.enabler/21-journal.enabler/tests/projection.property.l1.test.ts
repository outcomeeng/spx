import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { foldJournalRunState, type JournalRunState } from "@/domains/journal/run-state";
import type { JournalEvent } from "@/lib/agent-run-journal";
import { JOURNAL_RUN_STATE_TEST_GENERATOR } from "@testing/generators/journal/run-state";

function arbitraryStates(): fc.Arbitrary<readonly JournalRunState[]> {
  return fc.array(JOURNAL_RUN_STATE_TEST_GENERATOR.journalRunState(), {
    minLength: 0,
    maxLength: 3,
  });
}

/** A content-equal deep clone with a fresh object graph, standing in for a re-read across a backend. */
function acrossBackend(events: readonly JournalEvent[]): readonly JournalEvent[] {
  return structuredClone(events);
}

describe("journal run-state projection", () => {
  it("folds an event history to a projection identical across a backend serialization round-trip", () => {
    fc.assert(
      fc.property(
        arbitraryStates().chain((states) => JOURNAL_RUN_STATE_TEST_GENERATOR.runEvents(states)),
        fc.boolean(),
        (events, sealed) => {
          // A different object graph carrying the same serialized content must fold
          // identically — the projection depends only on event content, not identity,
          // so a local-file read and a pull-request-comment read agree.
          expect(foldJournalRunState(acrossBackend(events), sealed)).toEqual(foldJournalRunState(events, sealed));
        },
      ),
    );
  });

  it("folds to the last completed event, not the first, when a history carries several", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          JOURNAL_RUN_STATE_TEST_GENERATOR.journalRunState(),
          JOURNAL_RUN_STATE_TEST_GENERATOR.journalRunState(),
        )
          .filter(([first, last]) => JSON.stringify(first) !== JSON.stringify(last))
          .chain(([first, last]) =>
            fc.tuple(
              JOURNAL_RUN_STATE_TEST_GENERATOR.runEvents([last]),
              JOURNAL_RUN_STATE_TEST_GENERATOR.runEvents([first, last]),
            ).map(([onlyLast, firstThenLast]) => ({ onlyLast, firstThenLast }))
          ),
        ({ onlyLast, firstThenLast }) => {
          // Both histories share the same last completed event, so a last-wins fold
          // agrees; a first-wins fold would yield `first` for the second history and
          // diverge.
          expect(foldJournalRunState(firstThenLast, true)).toEqual(foldJournalRunState(onlyLast, true));
        },
      ),
    );
  });
});
