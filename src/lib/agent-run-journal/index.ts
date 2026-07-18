export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** CloudEvents v1.0 spec version every journal event carries. */
export const CLOUDEVENTS_SPECVERSION = "1.0" as const;

/** Sequence number assigned to the first event appended to a journal. */
export const JOURNAL_SEQ_BASE = 1 as const;

export const JOURNAL_BACKEND_KIND = {
  APPENDABLE: "appendable",
  SNAPSHOT: "snapshot",
} as const;

export type JournalBackendKind = (typeof JOURNAL_BACKEND_KIND)[keyof typeof JOURNAL_BACKEND_KIND];

/** A CloudEvents v1.0 record bearing the agent-run-journal stream extensions. */
export interface JournalEvent {
  readonly id: string;
  readonly source: string;
  readonly type: string;
  readonly specversion: typeof CLOUDEVENTS_SPECVERSION;
  readonly time: string;
  readonly streamid: string;
  readonly seq: number;
  readonly runid: string;
  readonly attempt: number;
  readonly data?: JsonValue;
}

/**
 * The caller-supplied attributes of an event. The journal assigns `seq` and
 * stamps `streamid`/`runid` from the journal identity at append time.
 */
export interface JournalEventInput {
  readonly id: string;
  readonly source: string;
  readonly type: string;
  readonly time: string;
  readonly attempt: number;
  readonly data?: JsonValue;
}

/**
 * Storage that records the canonical event history. The journal rejects an
 * append once `isSealed()` reports true, while a durable backend also enforces
 * its storage-level seal barrier at publication time. `append` enforces that
 * barrier and sequence exclusivity; `seal`/`isSealed` persist and report state.
 */
export interface AppendableBackend {
  readonly kind: typeof JOURNAL_BACKEND_KIND.APPENDABLE;
  /** Persist an event. Rejects a record whose `seq` is already consumed. */
  append(record: JournalEvent): Promise<void>;
  /** The full event history, oldest first. */
  readAll(): Promise<readonly JournalEvent[]>;
  /** Record that the stream is sealed; the journal rejects later appends via `isSealed`. */
  seal(): Promise<void>;
  /** Whether the stream has been sealed. */
  isSealed(): Promise<boolean>;
}

/** A sink that receives rendered projections. */
export interface SnapshotBackend {
  readonly kind: typeof JOURNAL_BACKEND_KIND.SNAPSHOT;
  write(rendered: string): Promise<void>;
}

export type JournalBackend = AppendableBackend | SnapshotBackend;

/** A pure fold of an event prefix into projected output. */
export type Projection<T> = (events: readonly JournalEvent[]) => T;

export interface JournalIdentity {
  readonly streamid: string;
  readonly runid: string;
}

export const JOURNAL_ERROR = {
  SEALED: "agent-run-journal is sealed",
  SEQ_CONSUMED: "agent-run-journal sequence number already consumed",
} as const;

export type JournalErrorCode = (typeof JOURNAL_ERROR)[keyof typeof JOURNAL_ERROR];

/** The closed set of CloudEvents core attributes and journal stream extensions every event carries. */
export const JOURNAL_EVENT_ATTRIBUTES = [
  "id",
  "source",
  "type",
  "specversion",
  "time",
  "streamid",
  "seq",
  "runid",
  "attempt",
] as const;

/** The kind of CloudEvents-conformance failure a candidate journal event exhibits. */
export const JOURNAL_CONFORMANCE_VIOLATION = {
  NOT_OBJECT: "not-object",
  ATTRIBUTE_NAME: "attribute-name",
  UNEXPECTED_ATTRIBUTE: "unexpected-attribute",
  MISSING_ATTRIBUTE: "missing-attribute",
  WRONG_SPECVERSION: "wrong-specversion",
  WRONG_TYPE: "wrong-type",
} as const;

export type JournalConformanceViolation =
  (typeof JOURNAL_CONFORMANCE_VIOLATION)[keyof typeof JOURNAL_CONFORMANCE_VIOLATION];

export type JournalEventConformance =
  | { readonly ok: true }
  | {
    readonly ok: false;
    readonly violation: JournalConformanceViolation;
    readonly error: string;
  };

/** CloudEvents v1.0 attribute-naming convention: lowercase ASCII letters and digits only. */
const ATTRIBUTE_NAME_PATTERN = /^[a-z0-9]+$/;
const STRING_ATTRIBUTES = ["id", "source", "type", "time", "specversion", "streamid", "runid"] as const;

/**
 * Validate a value against the journal's CloudEvents event schema: every attribute
 * name conforms to the CloudEvents naming convention, the closed set of core
 * attributes and stream extensions is present and typed, and `data` is the only
 * optional attribute. A rejection names the specific violation so each rule is
 * independently observable.
 */
export function checkJournalEventConformance(value: unknown): JournalEventConformance {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      ok: false,
      violation: JOURNAL_CONFORMANCE_VIOLATION.NOT_OBJECT,
      error: "event must be an object",
    };
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set<string>([...JOURNAL_EVENT_ATTRIBUTES, "data"]);

  for (const name of Object.keys(record)) {
    if (!ATTRIBUTE_NAME_PATTERN.test(name)) {
      return {
        ok: false,
        violation: JOURNAL_CONFORMANCE_VIOLATION.ATTRIBUTE_NAME,
        error: `attribute name "${name}" is not CloudEvents-conformant`,
      };
    }
    if (!allowed.has(name)) {
      return {
        ok: false,
        violation: JOURNAL_CONFORMANCE_VIOLATION.UNEXPECTED_ATTRIBUTE,
        error: `unexpected attribute "${name}"`,
      };
    }
  }
  for (const name of JOURNAL_EVENT_ATTRIBUTES) {
    if (!(name in record)) {
      return {
        ok: false,
        violation: JOURNAL_CONFORMANCE_VIOLATION.MISSING_ATTRIBUTE,
        error: `missing required attribute "${name}"`,
      };
    }
  }
  for (const name of STRING_ATTRIBUTES) {
    if (typeof record[name] !== "string") {
      return {
        ok: false,
        violation: JOURNAL_CONFORMANCE_VIOLATION.WRONG_TYPE,
        error: `attribute "${name}" must be a string`,
      };
    }
  }
  if (record.specversion !== CLOUDEVENTS_SPECVERSION) {
    return {
      ok: false,
      violation: JOURNAL_CONFORMANCE_VIOLATION.WRONG_SPECVERSION,
      error: `specversion must equal "${CLOUDEVENTS_SPECVERSION}"`,
    };
  }
  if (typeof record.seq !== "number" || !Number.isInteger(record.seq)) {
    return {
      ok: false,
      violation: JOURNAL_CONFORMANCE_VIOLATION.WRONG_TYPE,
      error: "attribute \"seq\" must be an integer",
    };
  }
  if (typeof record.attempt !== "number" || !Number.isInteger(record.attempt)) {
    return {
      ok: false,
      violation: JOURNAL_CONFORMANCE_VIOLATION.WRONG_TYPE,
      error: "attribute \"attempt\" must be an integer",
    };
  }

  return { ok: true };
}

export interface Journal {
  /** Append an event, assigning the next contiguous `seq`. Rejects when sealed. */
  append(input: JournalEventInput): Promise<JournalEvent>;
  /** Events at a `seq` at or above `fromCursor`, oldest first. */
  read(fromCursor: number): Promise<readonly JournalEvent[]>;
  /**
   * Render a projection over the event prefix up to and including `throughSeq`
   * (the full history when omitted) by replaying that prefix.
   */
  render<T>(projection: Projection<T>, throughSeq?: number): Promise<T>;
  /** Seal the journal; further appends are rejected. */
  seal(): Promise<void>;
}

/** Bind the journal contract to an Appendable backend for one run's stream. */
export function createJournal(backend: AppendableBackend, identity: JournalIdentity): Journal {
  return {
    async append(input: JournalEventInput): Promise<JournalEvent> {
      if (await backend.isSealed()) {
        throw new Error(JOURNAL_ERROR.SEALED);
      }
      const history = await backend.readAll();
      const event: JournalEvent = {
        id: input.id,
        source: input.source,
        type: input.type,
        specversion: CLOUDEVENTS_SPECVERSION,
        time: input.time,
        streamid: identity.streamid,
        seq: JOURNAL_SEQ_BASE + history.length,
        runid: identity.runid,
        attempt: input.attempt,
        ...(input.data === undefined ? {} : { data: input.data }),
      };
      await backend.append(event);
      return event;
    },

    async read(fromCursor: number): Promise<readonly JournalEvent[]> {
      const history = await backend.readAll();
      return history.filter((event) => event.seq >= fromCursor);
    },

    async render<T>(projection: Projection<T>, throughSeq?: number): Promise<T> {
      const history = await backend.readAll();
      const prefix = throughSeq === undefined ? history : history.filter((event) => event.seq <= throughSeq);
      return projection(prefix);
    },

    async seal(): Promise<void> {
      await backend.seal();
    },
  };
}
