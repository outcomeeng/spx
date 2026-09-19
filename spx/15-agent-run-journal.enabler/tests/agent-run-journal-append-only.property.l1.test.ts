import { isDeepStrictEqual } from "node:util";

import { describe, it } from "vitest";

import { createJournal, JOURNAL_SEQ_BASE, type JournalEvent } from "@/lib/agent-run-journal";
import { arbitraryJournalSequenceInput } from "@testing/generators/agent-run-journal";
import { createInMemoryAppendableBackend } from "@testing/harnesses/agent-run-journal/in-memory-backend";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("agent-run-journal — append-only history", () => {
  it("leaves every persisted event present and unchanged after each append", async () => {
    await assertProperty(
      arbitraryJournalSequenceInput(),
      async ({ inputs, identity }) => {
        const journal = createJournal(createInMemoryAppendableBackend(), identity);
        const appended: JournalEvent[] = [];
        for (const input of inputs) {
          const before = await journal.read(JOURNAL_SEQ_BASE);
          const event = await journal.append(input);
          appended.push(event);
          const after = await journal.read(JOURNAL_SEQ_BASE);

          // the prior history is a prefix of the new one (nothing removed, nothing mutated) and
          // the appended event is the only addition, at the end
          if (!isDeepStrictEqual(after.slice(0, before.length), before)) return false;
          if (after.length !== before.length + 1) return false;
          if (!isDeepStrictEqual(after[after.length - 1], event)) return false;
        }
        return isDeepStrictEqual(await journal.read(JOURNAL_SEQ_BASE), appended);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
