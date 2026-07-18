import { describe, expect, it } from "vitest";

import { JOURNAL_ERROR } from "@/lib/agent-run-journal";
import {
  observeConsumedSequenceRejection,
  observeMalformedJournalReplay,
  observePersistedSeal,
} from "@testing/harnesses/state/appendable-journal-store";

describe("appendable journal store — compliance", () => {
  it("rejects an append whose sequence number is already persisted with SEQ_CONSUMED", async () => {
    await observeConsumedSequenceRejection().then((observation) => {
      expect(observation.appendError).toBe(JOURNAL_ERROR.SEQ_CONSUMED);
      expect(observation.replay).toEqual([observation.event]);
    });
  });

  it("reports the persisted seal across a fresh store and rejects a journal append after seal", async () => {
    await observePersistedSeal().then((observation) => {
      expect(observation.sealed).toBe(true);
      expect(observation.appendError).toBe(JOURNAL_ERROR.SEALED);
    });
  });

  it("skips stored lines that fail parsing or event conformance", async () => {
    await observeMalformedJournalReplay().then((observation) => {
      expect(observation.nonconformant.replay).toEqual([observation.nonconformant.event]);
      expect(observation.unparsable.replay).toEqual([observation.unparsable.event]);
    });
  });
});
