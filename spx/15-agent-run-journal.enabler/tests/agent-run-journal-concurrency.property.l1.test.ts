import { isDeepStrictEqual } from "node:util";

import { describe, it } from "vitest";

import { createJournal, JOURNAL_SEQ_BASE } from "@/lib/agent-run-journal";
import { arbitraryJournalSequenceInput } from "@testing/generators/agent-run-journal";
import { createInMemoryAppendableBackend } from "@testing/harnesses/agent-run-journal/in-memory-backend";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("agent-run-journal — allocation under contention", () => {
  it("persists unique contiguous sequences and returns every persisted event when independent journals append concurrently", async () => {
    await assertProperty(
      arbitraryJournalSequenceInput(),
      async ({ inputs, identity }) => {
        // One journal instance per appender, all bound to one shared run history and
        // started together, so every appender reads the same history before any publishes.
        const backend = createInMemoryAppendableBackend();
        const returned = await Promise.all(
          inputs.map((input) => createJournal(backend, identity).append(input)),
        );
        const persisted = await backend.readAll();
        const persistedSequences = persisted.map((event) => event.seq).sort((left, right) => left - right);

        return returned.length === inputs.length
          && isDeepStrictEqual(
            persistedSequences,
            inputs.map((_input, index) => JOURNAL_SEQ_BASE + index),
          )
          && new Set(returned.map((event) => event.seq)).size === returned.length
          && returned.every((event) => persisted.some((stored) => isDeepStrictEqual(stored, event)));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
