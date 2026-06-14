import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { checkJournalEventConformance, createJournal } from "@/lib/agent-run-journal";
import { arbitraryJournalEventInput, arbitraryJournalIdentity } from "@testing/generators/agent-run-journal";
import { createInMemoryAppendableBackend } from "@testing/harnesses/agent-run-journal/in-memory-backend";

describe("agent-run-journal CloudEvents conformance", () => {
  it("constructs each appended event conforming to the CloudEvents event schema", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryJournalEventInput(),
        arbitraryJournalIdentity(),
        async (input, identity) => {
          const journal = createJournal(createInMemoryAppendableBackend(), identity);
          const event = await journal.append(input);

          // the event passes the closed-set CloudEvents schema validator (every
          // required attribute present and typed, every attribute name conformant)
          expect(checkJournalEventConformance(event)).toEqual({ ok: true });

          // and its attributes derive from the caller input and the journal identity
          expect(event.id).toBe(input.id);
          expect(event.source).toBe(input.source);
          expect(event.type).toBe(input.type);
          expect(event.time).toBe(input.time);
          expect(event.attempt).toBe(input.attempt);
          expect(event.streamid).toBe(identity.streamid);
          expect(event.runid).toBe(identity.runid);
        },
      ),
    );
  });

  it("rejects a stream-extension name that violates the CloudEvents naming convention", async () => {
    const [input] = fc.sample(arbitraryJournalEventInput(), 1);
    const [identity] = fc.sample(arbitraryJournalIdentity(), 1);
    const journal = createJournal(createInMemoryAppendableBackend(), identity);
    const event = await journal.append(input);

    const { streamid, ...rest } = event;
    const underscored = { ...rest, stream_id: streamid };

    expect(checkJournalEventConformance(underscored).ok).toBe(false);
  });
});
