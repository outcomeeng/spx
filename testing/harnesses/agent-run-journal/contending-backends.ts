/**
 * Controlled Appendable backends for the journal's allocation-under-contention
 * evidence. Each is a real `AppendableBackend` implementation that simulates a
 * storage condition the in-memory backend cannot produce on demand (failure
 * simulation) and records how the journal drives it (observability); the linked
 * test owns every predicate over the recorded observations.
 */

import {
  type AppendableBackend,
  JOURNAL_BACKEND_KIND,
  JOURNAL_ERROR,
  type JournalEvent,
} from "@/lib/agent-run-journal";

/** Observations a controlled backend records while a journal drives it. */
export interface BackendDriveObservation {
  /** How many times the journal read the full history. */
  readonly readAllCount: number;
  /** The `seq` of every append attempted, in order. */
  readonly attemptedSequences: readonly number[];
}

export interface ControlledAppendableBackend extends AppendableBackend {
  readonly observation: BackendDriveObservation;
}

class RecordingBackend implements ControlledAppendableBackend {
  readonly kind = JOURNAL_BACKEND_KIND.APPENDABLE;
  protected readonly events: JournalEvent[] = [];
  private readAllCount = 0;
  private readonly attemptedSequences: number[] = [];
  private sealed = false;

  get observation(): BackendDriveObservation {
    return { readAllCount: this.readAllCount, attemptedSequences: this.attemptedSequences.slice() };
  }

  async append(record: JournalEvent): Promise<void> {
    this.attemptedSequences.push(record.seq);
    this.onAppend(record);
  }

  async readAll(): Promise<readonly JournalEvent[]> {
    this.readAllCount += 1;
    return this.events.slice();
  }

  async seal(): Promise<void> {
    this.sealed = true;
  }

  async isSealed(): Promise<boolean> {
    return this.sealed;
  }

  protected onAppend(record: JournalEvent): void {
    this.events.push(record);
  }
}

/** Rejects every append as a consumed sequence while its history never grows. */
class NonGrowingRejectingBackend extends RecordingBackend {
  protected override onAppend(): void {
    throw new Error(JOURNAL_ERROR.SEQ_CONSUMED);
  }
}

/**
 * Rejects the first `competitorCount` appends as consumed sequences, each time
 * persisting a competitor's event at the contested sequence, so every rejection
 * is explained by a history that grew.
 */
class ContendingBackend extends RecordingBackend {
  private remainingCompetitors: number;

  constructor(competitorCount: number) {
    super();
    this.remainingCompetitors = competitorCount;
  }

  protected override onAppend(record: JournalEvent): void {
    if (this.events.some((event) => event.seq === record.seq)) {
      throw new Error(JOURNAL_ERROR.SEQ_CONSUMED);
    }
    if (this.remainingCompetitors > 0) {
      this.remainingCompetitors -= 1;
      this.events.push({ ...record, id: `competitor-${record.seq}` });
      throw new Error(JOURNAL_ERROR.SEQ_CONSUMED);
    }
    this.events.push(record);
  }
}

/** A backend whose every append rejects with `SEQ_CONSUMED` and whose history never grows. */
export function createNonGrowingRejectingBackend(): ControlledAppendableBackend {
  return new NonGrowingRejectingBackend();
}

/** A backend on which `competitorCount` competitors each win one contested sequence before the caller's append lands. */
export function createContendingBackend(competitorCount: number): ControlledAppendableBackend {
  return new ContendingBackend(competitorCount);
}
