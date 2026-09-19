# Appendable journal store issues

## Two evidence cases cannot distinguish the clause they name

- `tests/appendable-journal-store-creation-marker.scenario.l1.test.ts` asserts that the
  creation marker retains the opened file's inode and birthtime, but
  `observeAppendableJournalCreationMarker` projects only `birthtimeMs`; inode retention
  is inferred from birthtime equality under the in-memory filesystem's link semantics.
- `tests/appendable-journal-store.compliance.l1.test.ts` asserts that a consumed-sequence
  append never overwrites the stored event, but `observeConsumedSequenceRejection`
  re-appends the identical event, so an unchanged event and one overwritten with the same
  bytes read alike; the clause rests on the `JOURNAL_ERROR.SEQ_CONSUMED` rejection alone.

**Impact:** each case proves a weaker clause than its assertion states, though no
mutation reachable through the injected `StateStoreFileSystem` makes either pass wrongly.

**Settlement condition:** the creation-marker observation exposes the inode and the test
asserts its equality; the consumed-sequence observation appends a distinct payload at the
persisted sequence and the test asserts the stored event unchanged. Surfaced by the
test-evidence audit on the allocation-under-contention changeset.
