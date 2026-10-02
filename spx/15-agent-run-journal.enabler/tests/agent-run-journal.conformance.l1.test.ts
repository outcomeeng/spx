import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  checkJournalEventConformance,
  createJournal,
  JOURNAL_CONFORMANCE_VIOLATION,
  type JournalConformanceViolation,
} from "@/lib/agent-run-journal";
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

  it("rejects an underscored extension name with the naming-convention violation, isolating the naming rule", async () => {
    const [input] = fc.sample(arbitraryJournalEventInput(), 1);
    const [identity] = fc.sample(arbitraryJournalIdentity(), 1);
    const journal = createJournal(createInMemoryAppendableBackend(), identity);
    const event = await journal.append(input);

    // Keep every required attribute present and add an underscored name, so the
    // ONLY violation is the naming convention. Asserting the specific violation
    // fails if the naming check is dropped — the extra key would then surface as
    // an unexpected attribute, not a naming-convention failure.
    const withUnderscoredName = { ...event, stream_id: event.streamid };
    const result = checkJournalEventConformance(withUnderscoredName);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violation).toBe(JOURNAL_CONFORMANCE_VIOLATION.ATTRIBUTE_NAME);
    }
  });

  it("rejects an event missing a required attribute with the missing-attribute violation", async () => {
    const [input] = fc.sample(arbitraryJournalEventInput(), 1);
    const [identity] = fc.sample(arbitraryJournalIdentity(), 1);
    const journal = createJournal(createInMemoryAppendableBackend(), identity);
    const event = await journal.append(input);

    // Drop a required stream extension while keeping every present name well-formed,
    // so the only violation is the missing attribute — isolating that rule from the
    // naming and unexpected-attribute checks that precede it.
    const withoutStreamid: Record<string, unknown> = { ...event };
    delete withoutStreamid.streamid;
    const result = checkJournalEventConformance(withoutStreamid);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violation).toBe(JOURNAL_CONFORMANCE_VIOLATION.MISSING_ATTRIBUTE);
    }
  });

  it("names every remaining conformance violation independently", async () => {
    const [input] = fc.sample(arbitraryJournalEventInput(), 1);
    const [identity] = fc.sample(arbitraryJournalIdentity(), 1);
    const journal = createJournal(createInMemoryAppendableBackend(), identity);
    const event = await journal.append(input);

    // Each candidate carries exactly one defect and reaches one named violation;
    // with the naming and missing-attribute cases above, every member of
    // JOURNAL_CONFORMANCE_VIOLATION is independently reached from a test.
    const cases: ReadonlyArray<readonly [unknown, JournalConformanceViolation]> = [
      ["not an event object", JOURNAL_CONFORMANCE_VIOLATION.NOT_OBJECT],
      [{ ...event, extradata: event.id }, JOURNAL_CONFORMANCE_VIOLATION.UNEXPECTED_ATTRIBUTE],
      [{ ...event, specversion: event.id }, JOURNAL_CONFORMANCE_VIOLATION.WRONG_SPECVERSION],
      [{ ...event, specversion: event.seq }, JOURNAL_CONFORMANCE_VIOLATION.WRONG_TYPE],
      [{ ...event, id: event.seq }, JOURNAL_CONFORMANCE_VIOLATION.WRONG_TYPE],
      [{ ...event, seq: event.seq + 0.5 }, JOURNAL_CONFORMANCE_VIOLATION.WRONG_TYPE],
    ];

    for (const [candidate, expected] of cases) {
      const result = checkJournalEventConformance(candidate);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.violation).toBe(expected);
      }
    }
  });
});
