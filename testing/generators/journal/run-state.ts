import * as fc from "fast-check";

import {
  JOURNAL_RUN_EVENT,
  JOURNAL_RUN_STATE_STATUS,
  JOURNAL_TARGET_KIND,
  journalRunCompletedEventType,
  type JournalRunState,
  journalRunStateRecord,
  type JournalRunStateStatus,
  type JournalTargetKind,
} from "@/domains/journal/run-state";
import { CLOUDEVENTS_SPECVERSION, JOURNAL_SEQ_BASE, type JournalEvent, type JsonValue } from "@/lib/agent-run-journal";
import { RUNTIME_EVENT_NAMESPACE_DEFAULT } from "@/lib/agent-run-journal/config";
import { formatRunTimestamp } from "@/lib/state-store";
import { CONFIG_TEST_GENERATOR } from "@testing/generators/config/descriptors";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";

const HEX_SHA_PATTERN = /^[a-f0-9]{40}$/;
const HEX_DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const MAX_PULL_REQUEST_NUMBER = 99_999;
const MAX_RUN_DURATION_MS = 86_400_000;
const NON_COMPLETED_EVENT_TYPES = [JOURNAL_RUN_EVENT.STARTED_TYPE, JOURNAL_RUN_EVENT.PROGRESS_TYPE] as const;

function arbitraryTimestampDate(): fc.Arbitrary<Date> {
  return fc.date({
    min: new Date(Date.UTC(2024, 0, 1)),
    max: new Date(Date.UTC(2026, 11, 31)),
    noInvalidDate: true,
  });
}

function arbitraryJournalRunState(): fc.Arbitrary<JournalRunState> {
  return fc
    .record({
      branchName: STATE_STORE_TEST_GENERATOR.branchIdentity(),
      branchSlug: STATE_STORE_TEST_GENERATOR.branchSlug(),
      targetKind: fc.constantFrom<JournalTargetKind>(...Object.values(JOURNAL_TARGET_KIND)),
      pullRequestNumber: fc.integer({ min: 0, max: MAX_PULL_REQUEST_NUMBER }),
      headSha: fc.stringMatching(HEX_SHA_PATTERN),
      baseRef: CONFIG_TEST_GENERATOR.key(),
      baseSha: fc.option(fc.stringMatching(HEX_SHA_PATTERN), { nil: undefined }),
      configDigest: fc.stringMatching(HEX_DIGEST_PATTERN),
      participants: fc.array(CONFIG_TEST_GENERATOR.key(), { minLength: 0, maxLength: 4 }),
      scope: CONFIG_TEST_GENERATOR.pathFilter(),
      startedDate: arbitraryTimestampDate(),
      durationMs: fc.nat({ max: MAX_RUN_DURATION_MS }),
      outputPaths: fc.array(CONFIG_TEST_GENERATOR.key(), { minLength: 0, maxLength: 3 }),
      status: fc.constantFrom<JournalRunStateStatus>(...Object.values(JOURNAL_RUN_STATE_STATUS)),
    })
    .map((draft) => {
      const startedAt = formatRunTimestamp(draft.startedDate);
      const completedAt = formatRunTimestamp(new Date(draft.startedDate.getTime() + draft.durationMs));
      return {
        branchName: draft.branchName,
        branchSlug: draft.branchSlug,
        targetKind: draft.targetKind,
        ...(draft.targetKind === JOURNAL_TARGET_KIND.PULL_REQUEST
          ? { pullRequestNumber: draft.pullRequestNumber }
          : {}),
        headSha: draft.headSha,
        baseRef: draft.baseRef,
        ...(draft.baseSha === undefined ? {} : { baseSha: draft.baseSha }),
        configDigest: draft.configDigest,
        participants: draft.participants,
        scope: draft.scope,
        startedAt,
        completedAt,
        outputPaths: draft.outputPaths,
        status: draft.status,
      };
    });
}

function buildJournalEvent(seq: number, type: string, data: JsonValue): JournalEvent {
  return {
    id: `${type}:${seq}`,
    source: JOURNAL_RUN_EVENT.SOURCE,
    type,
    specversion: CLOUDEVENTS_SPECVERSION,
    time: formatRunTimestamp(new Date(Date.UTC(2026, 0, 1))),
    streamid: JOURNAL_RUN_EVENT.SOURCE,
    seq,
    runid: JOURNAL_RUN_EVENT.SOURCE,
    attempt: JOURNAL_SEQ_BASE,
    data,
  };
}

/** A completed event carrying a run state's serialized record. */
function completedEvent(seq: number, state: JournalRunState): JournalEvent {
  return buildJournalEvent(seq, JOURNAL_RUN_EVENT.COMPLETED_TYPE, journalRunStateRecord(state));
}

function completedEventWithNamespace(seq: number, namespace: string, state: JournalRunState): JournalEvent {
  return buildJournalEvent(seq, journalRunCompletedEventType(namespace), journalRunStateRecord(state));
}

function completedEventNamespace(): fc.Arbitrary<string> {
  return CONFIG_TEST_GENERATOR.key().filter((namespace) => namespace !== RUNTIME_EVENT_NAMESPACE_DEFAULT);
}

/** A non-completed lifecycle event (started or progress) the fold ignores. */
function arbitraryNonCompletedEvent(seq: number): fc.Arbitrary<JournalEvent> {
  return fc
    .constantFrom(...NON_COMPLETED_EVENT_TYPES)
    .map((type) => buildJournalEvent(seq, type, null));
}

export const JOURNAL_RUN_STATE_TEST_GENERATOR = {
  journalRunState: arbitraryJournalRunState,
  /** An event history of leading non-completed events followed by `states.length` completed events. */
  runEvents: (states: readonly JournalRunState[]): fc.Arbitrary<readonly JournalEvent[]> =>
    fc.array(fc.boolean(), { minLength: 0, maxLength: 3 }).map((leading) => {
      const leadingEvents = leading.map((_value, index) =>
        buildJournalEvent(
          JOURNAL_SEQ_BASE + index,
          NON_COMPLETED_EVENT_TYPES[index % NON_COMPLETED_EVENT_TYPES.length],
          null,
        )
      );
      const completedEvents = states.map((state, index) =>
        completedEvent(JOURNAL_SEQ_BASE + leadingEvents.length + index, state)
      );
      return [...leadingEvents, ...completedEvents];
    }),
  /** A history with non-completed events only — no terminal-completion event. */
  nonCompletedEvents: (): fc.Arbitrary<readonly JournalEvent[]> =>
    fc.array(arbitraryNonCompletedEvent(JOURNAL_SEQ_BASE), { minLength: 1, maxLength: 4 }).map((events) =>
      events.map((event, index) => ({ ...event, seq: JOURNAL_SEQ_BASE + index }))
    ),
  /** A history whose terminal-completion event carries a payload that is not a valid run state. */
  invalidCompletedEvents: (): fc.Arbitrary<readonly JournalEvent[]> =>
    CONFIG_TEST_GENERATOR.key().map((status) => [
      buildJournalEvent(JOURNAL_SEQ_BASE, JOURNAL_RUN_EVENT.COMPLETED_TYPE, { status }),
    ]),
  completedEvent,
  completedEventNamespace,
  completedEventWithNamespace,
} as const;
