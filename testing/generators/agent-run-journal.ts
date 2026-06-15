/** Input-domain generators for agent-run-journal tests. */

import fc from "fast-check";

import type { JournalEventInput, JournalIdentity, JsonValue } from "@/lib/agent-run-journal";

/** Upper bound (ms since epoch) for generated event timestamps — start of year 2100. */
const MILLIS_UPPER_BOUND = 4_102_444_800_000;

const arbitraryJsonScalar: fc.Arbitrary<JsonValue> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
);

const arbitraryRfc3339Time: fc.Arbitrary<string> = fc
  .integer({ min: 0, max: MILLIS_UPPER_BOUND })
  .map((millis) => new Date(millis).toISOString());

/** A caller-supplied event input — every CloudEvents attribute the journal does not assign. */
export function arbitraryJournalEventInput(): fc.Arbitrary<JournalEventInput> {
  return fc.record({
    id: fc.uuid(),
    source: fc.webUrl(),
    type: fc.string({ minLength: 1 }),
    time: arbitraryRfc3339Time,
    attempt: fc.integer({ min: 1, max: 5 }),
    data: fc.option(arbitraryJsonScalar, { nil: undefined }),
  });
}

/** A non-empty sequence of event inputs to append to a journal. */
export function arbitraryJournalEventInputs(): fc.Arbitrary<readonly JournalEventInput[]> {
  return fc.array(arbitraryJournalEventInput(), { minLength: 1, maxLength: 12 });
}

export function arbitraryJournalIdentity(): fc.Arbitrary<JournalIdentity> {
  return fc.record({
    streamid: fc.uuid(),
    runid: fc.uuid(),
  });
}
