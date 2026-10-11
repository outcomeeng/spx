import { describe, expect, it } from "vitest";

import {
  checkJournalEventConformance,
  createJournal,
  JOURNAL_CONFORMANCE_VIOLATION,
  JOURNAL_SEQ_BASE,
  type JournalConformanceViolation,
} from "@/lib/agent-run-journal";
import {
  arbitraryJournalEventInput,
  arbitraryJournalIdentity,
  arbitraryJournalSequenceInput,
  sampleAgentRunJournalValue,
} from "@testing/generators/agent-run-journal";
import { createJournalAdapterStorages } from "@testing/harnesses/agent-run-journal/adapters";
import { loadCloudEventsOracle } from "@testing/harnesses/agent-run-journal/cloudevents-oracle";
import { createInMemoryAppendableBackend } from "@testing/harnesses/agent-run-journal/in-memory-backend";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("agent-run-journal CloudEvents conformance", () => {
  it("appends events that the captured CloudEvents v1.0 schema accepts and that carry the journal stream extensions", async () => {
    const oracle = await loadCloudEventsOracle();
    await assertProperty(
      arbitraryJournalSequenceInput(),
      async ({ inputs, identity }) => {
        for (const storage of createJournalAdapterStorages(identity)) {
          const journal = createJournal(storage.open(), identity);
          for (const [index, input] of inputs.entries()) {
            const event = await journal.append(input);
            // the official schema accepts the event, and its specversion is the value the release requires
            expect(oracle.eventSchema.safeParse(event).success, storage.adapter).toBe(true);
            expect(event.specversion).toBe(oracle.specversion);
            // every extension attribute follows the CloudEvents attribute-naming rule
            for (const name of Object.keys(event).filter((key) => !oracle.contextAttributeNames.has(key))) {
              expect(name).toMatch(oracle.attributeNamePattern);
            }
            // the context attributes carry the caller's input, and the stream extensions the journal identity
            expect(event.id).toBe(input.id);
            expect(event.source).toBe(input.source);
            expect(event.type).toBe(input.type);
            expect(event.time).toBe(input.time);
            expect(event.attempt).toBe(input.attempt);
            expect(event.streamid).toBe(identity.streamid);
            expect(event.runid).toBe(identity.runid);
            expect(event.seq).toBe(JOURNAL_SEQ_BASE + index);
          }
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects an appended event carrying a defect only the captured schema constrains, while accepting the unmodified event", async () => {
    const oracle = await loadCloudEventsOracle();
    await assertProperty(
      arbitraryJournalSequenceInput(),
      async ({ inputs, identity }) => {
        const journal = createJournal(createInMemoryAppendableBackend(), identity);
        for (const input of inputs) {
          const event = await journal.append(input);
          // the schema constrains value shapes the structural attribute checks never reach
          const defective: ReadonlyArray<Record<string, unknown>> = [
            { ...event, id: "" },
            { ...event, id: event.seq },
            { ...event, source: event.seq },
            { ...event, time: event.id },
          ];
          expect(oracle.eventSchema.safeParse(event).success).toBe(true);
          for (const candidate of defective) {
            expect(oracle.eventSchema.safeParse(candidate).success).toBe(false);
          }
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects an underscored extension name with the naming-convention violation, isolating the naming rule", async () => {
    const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());
    const identity = sampleAgentRunJournalValue(arbitraryJournalIdentity());
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
    const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());
    const identity = sampleAgentRunJournalValue(arbitraryJournalIdentity());
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
    const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());
    const identity = sampleAgentRunJournalValue(arbitraryJournalIdentity());
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
