/** A real in-memory Appendable backend injected into journal tests — never a mock. */

import {
  type AppendableBackend,
  JOURNAL_BACKEND_KIND,
  JOURNAL_ERROR,
  type JournalEvent,
} from "@/lib/agent-run-journal";

class InMemoryAppendableBackend implements AppendableBackend {
  readonly kind = JOURNAL_BACKEND_KIND.APPENDABLE;
  private readonly events: JournalEvent[] = [];
  private sealed = false;

  async append(record: JournalEvent): Promise<void> {
    if (this.events.some((event) => event.seq === record.seq)) {
      throw new Error(JOURNAL_ERROR.SEQ_CONSUMED);
    }
    this.events.push(record);
  }

  async readAll(): Promise<readonly JournalEvent[]> {
    return this.events.slice();
  }

  async seal(): Promise<void> {
    this.sealed = true;
  }

  async isSealed(): Promise<boolean> {
    return this.sealed;
  }
}

/** Construct a fresh in-memory Appendable backend with an empty history. */
export function createInMemoryAppendableBackend(): AppendableBackend {
  return new InMemoryAppendableBackend();
}
