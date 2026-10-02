/**
 * Every Appendable adapter kind the journal binds, opened over its own persisted run history.
 *
 * The journal's cross-adapter evidence drives each kind through the same journal contract: the
 * in-memory backend, which holds its history as live objects, and the appendable journal store,
 * which publishes each event as a serialized JSONL sequence record and replays parsed records. A
 * storage's `open()` returns a backend bound to that storage's persisted history, so opening it
 * again is a restart: the in-memory kind reopens the same instance, while the store kind reopens a
 * fresh store over the same run file. The store runs over the in-memory state-store filesystem
 * (combinatorial-cost exception: a real temporary directory per generated case and adapter would
 * multiply filesystem work across every property run without changing the store's code path). The
 * harness exposes handles only; the linked test owns every predicate.
 *
 * @module testing/harnesses/agent-run-journal/adapters
 */

import type { AppendableBackend, JournalIdentity } from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import { journalRunFilePath } from "@testing/generators/agent-run-journal";
import { createInMemoryAppendableBackend } from "@testing/harnesses/agent-run-journal/in-memory-backend";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

/** The Appendable adapter kinds the cross-adapter evidence covers. */
export const JOURNAL_ADAPTER = {
  IN_MEMORY: "in-memory",
  APPENDABLE_JOURNAL_STORE: "appendable-journal-store",
} as const;

export type JournalAdapter = (typeof JOURNAL_ADAPTER)[keyof typeof JOURNAL_ADAPTER];

export interface JournalAdapterStorage {
  readonly adapter: JournalAdapter;
  /** A backend bound to this storage's persisted history; a second call is a restart. */
  open(): AppendableBackend;
}

function inMemoryStorage(): JournalAdapterStorage {
  const backend = createInMemoryAppendableBackend();
  return { adapter: JOURNAL_ADAPTER.IN_MEMORY, open: () => backend };
}

function appendableJournalStoreStorage(identity: JournalIdentity): JournalAdapterStorage {
  const fs = createInMemoryStateStoreFileSystem();
  const runFilePath = journalRunFilePath(identity.streamid);
  return {
    adapter: JOURNAL_ADAPTER.APPENDABLE_JOURNAL_STORE,
    open: () => createAppendableJournalStore({ runFilePath, fs }),
  };
}

/** One fresh, empty storage per adapter kind for a run's stream. */
export function createJournalAdapterStorages(identity: JournalIdentity): readonly JournalAdapterStorage[] {
  return [inMemoryStorage(), appendableJournalStoreStorage(identity)];
}
