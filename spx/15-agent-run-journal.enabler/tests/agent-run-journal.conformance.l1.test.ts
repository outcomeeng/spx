import { describe, it } from "vitest";

import { createJournal, JOURNAL_SEQ_BASE, type JournalEvent } from "@/lib/agent-run-journal";
import { arbitraryJournalSequenceInput } from "@testing/generators/agent-run-journal";
import { loadCloudEventsOracle } from "@testing/harnesses/agent-run-journal/cloudevents-oracle";
import { createInMemoryAppendableBackend } from "@testing/harnesses/agent-run-journal/in-memory-backend";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("agent-run-journal CloudEvents conformance", () => {
  it("appends events that the captured CloudEvents v1.0 schema accepts and that carry the journal stream extensions", async () => {
    const oracle = await loadCloudEventsOracle();
    await assertProperty(
      arbitraryJournalSequenceInput(),
      async ({ inputs, identity }) => {
        const journal = createJournal(createInMemoryAppendableBackend(), identity);
        const appended: JournalEvent[] = [];
        for (const input of inputs) appended.push(await journal.append(input));

        return appended.every((event, index) => {
          const input = inputs[index];
          const extensionNames = Object.keys(event).filter((name) => !oracle.contextAttributeNames.has(name));
          // the official schema accepts the event, and its specversion is the value the release requires
          return input !== undefined
            && oracle.eventSchema.safeParse(event).success
            && event.specversion === oracle.specversion
            // every extension attribute follows the CloudEvents attribute-naming rule
            && extensionNames.every((name) => oracle.attributeNamePattern.test(name))
            // the context attributes carry the caller's input, and the stream extensions the journal identity
            && event.id === input.id
            && event.source === input.source
            && event.type === input.type
            && event.time === input.time
            && event.attempt === input.attempt
            && event.streamid === identity.streamid
            && event.runid === identity.runid
            && event.seq === JOURNAL_SEQ_BASE + index;
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
