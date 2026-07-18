import fc from "fast-check";

import {
  CLOUDEVENTS_SPECVERSION,
  type JournalEvent,
  type JournalEventInput,
  type JournalIdentity,
  type JsonValue,
} from "@/lib/agent-run-journal";

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

/** A full journal event — a caller input plus the stream identity the journal assigns. */
export function arbitraryJournalEvent(): fc.Arbitrary<JournalEvent> {
  return fc.record({
    id: fc.uuid(),
    source: fc.webUrl(),
    type: fc.string({ minLength: 1 }),
    specversion: fc.constant(CLOUDEVENTS_SPECVERSION),
    time: arbitraryRfc3339Time,
    streamid: fc.uuid(),
    seq: fc.integer({ min: 1 }),
    runid: fc.uuid(),
    attempt: fc.integer({ min: 1, max: 5 }),
    data: fc.option(arbitraryJsonScalar, { nil: undefined }),
  });
}

export function arbitraryJournalIdentity(): fc.Arbitrary<JournalIdentity> {
  return fc.record({
    streamid: fc.uuid(),
    runid: fc.uuid(),
  });
}

export interface JournalSequenceInput {
  readonly inputs: readonly JournalEventInput[];
  readonly identity: JournalIdentity;
}

export interface JournalPairInput {
  readonly firstInput: JournalEventInput;
  readonly secondInput: JournalEventInput;
  readonly identity: JournalIdentity;
}

export function arbitraryJournalSequenceInput(): fc.Arbitrary<JournalSequenceInput> {
  return fc.record({ inputs: arbitraryJournalEventInputs(), identity: arbitraryJournalIdentity() });
}

export function arbitraryJournalPairInput(): fc.Arbitrary<JournalPairInput> {
  return fc.record({
    firstInput: arbitraryJournalEventInput(),
    secondInput: arbitraryJournalEventInput(),
    identity: arbitraryJournalIdentity(),
  });
}

export function arbitraryMalformedJournalLines(): fc.Arbitrary<readonly [string, string]> {
  return fc.tuple(
    fc.record({ unexpected: fc.string() }).map(JSON.stringify),
    fc.string({ minLength: 1 }).filter((value) => {
      try {
        JSON.parse(value);
        return false;
      } catch {
        return true;
      }
    }),
  );
}

/** Build the complete event expected when a journal assigns identity and sequence to an input. */
export function journalEventFromInput(
  input: JournalEventInput,
  identity: JournalIdentity,
  sequence: number,
): JournalEvent {
  return {
    id: input.id,
    source: input.source,
    type: input.type,
    specversion: CLOUDEVENTS_SPECVERSION,
    time: input.time,
    streamid: identity.streamid,
    seq: sequence,
    runid: identity.runid,
    attempt: input.attempt,
    ...(input.data === undefined ? {} : { data: input.data }),
  };
}

const SAMPLE_SEED = 0x6a726e6c;

/** Draw one deterministic value from an agent-run-journal arbitrary. */
export function sampleAgentRunJournalValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { seed: SAMPLE_SEED, numRuns: 1 });
  if (value === undefined) throw new Error("agent-run-journal test generator returned no sample");
  return value;
}

/** A deterministic per-stream run file path for journal-store tests. */
export function journalRunFilePath(streamid: string): string {
  return `journal-runs/${streamid}`;
}
