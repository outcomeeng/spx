import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { foldJournalRunState, type JournalRunState } from "@/domains/journal/run-state";
import { JOURNAL_RUN_STATE_TEST_GENERATOR } from "@testing/generators/journal/run-state";

function arbitraryStates(): fc.Arbitrary<readonly JournalRunState[]> {
  return fc.array(JOURNAL_RUN_STATE_TEST_GENERATOR.journalRunState(), {
    minLength: 0,
    maxLength: 3,
  });
}

describe("journal run-state projection", () => {
  it("renders the same projection from the same event history on repeated calls", () => {
    fc.assert(
      fc.property(
        arbitraryStates().chain((states) => JOURNAL_RUN_STATE_TEST_GENERATOR.runEvents(states)),
        fc.boolean(),
        (events, sealed) => {
          expect(foldJournalRunState(events, sealed)).toEqual(foldJournalRunState(events, sealed));
        },
      ),
    );
  });

  it("renders the same projection for any two histories sharing the same terminal-completion events", () => {
    fc.assert(
      fc.property(
        arbitraryStates().chain((states) =>
          fc.tuple(
            JOURNAL_RUN_STATE_TEST_GENERATOR.runEvents(states),
            JOURNAL_RUN_STATE_TEST_GENERATOR.runEvents(states),
          ).map(([left, right]) => ({ left, right }))
        ),
        fc.boolean(),
        ({ left, right }, sealed) => {
          expect(foldJournalRunState(left, sealed)).toEqual(foldJournalRunState(right, sealed));
        },
      ),
    );
  });
});
