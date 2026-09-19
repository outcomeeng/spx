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

## The interruption evidence expects events built by the production constructor

`tests/appendable-journal-store-interruption.compliance.l1.test.ts` compares each
replayed event against `createJournalEvent` from `src/lib/agent-run-journal/index.ts`,
the constructor `createJournal().append()` itself uses to build the persisted record.
A production mutation of that assembly — a dropped `attempt`, a changed `specversion` —
alters the persisted record and the expectation alike, so the replay comparison stays
green. The subject of this evidence is interruption recovery, which the assertion
proves through which sequences replay and where the next append lands; the field
derivation itself is the journal node's conformance subject and is recorded there.

**Impact:** the replay comparison proves event identity only up to the production
assembly; a derivation defect would pass here and is caught, if at all, by the journal
node's conformance evidence.

**Settlement condition:** a generator-owned construction law derived from the spec's
declared field derivations, distinct from the production assembly, supplies the expected
replay events, or the comparison narrows to the sequence and input identity the assertion
names. Surfaced by the changes review on the allocation-under-contention changeset.
