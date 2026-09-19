# Agent run journal issues

## The `runtime.eventNamespace` override is validated but unused

`runtimeConfigDescriptor` (`src/lib/agent-run-journal/config.ts`) is registered in
`productionRegistry`, and its `validate()` accepts and resolves a caller-supplied
`runtime.eventNamespace` override. No consumer reads the resolved
`RuntimeConfig.eventNamespace`: the journal run event types (`JOURNAL_RUN_EVENT.*`
in `src/domains/journal/run-state.ts`) and the verify event types
(`VERIFY_APPEND_EVENT_TYPE.*`, `VERIFY_TERMINAL_EVENT_TYPE` in
`src/domains/verify/verify.ts`) are module-level constants composed from the
compile-time `RUNTIME_EVENT_NAMESPACE_DEFAULT`. Setting `runtime.eventNamespace` to a
non-default value therefore validates with no effect on stored event types.

The descriptor's single declaration of the namespace root is the delivered scope:
`RUNTIME_EVENT_NAMESPACE_DEFAULT` is the sole source, and every event type composes
from it rather than restating the root. Wiring the override to take effect is a
separate, larger change: it requires threading the resolved `RuntimeConfig` into the
event-type construction, which converts the module-level `const` event types into
config-derived values built where the resolved config is available. Settle whether the
override should take effect (and where the resolved config is threaded) before
implementing. The field-level and `validate`-site comments in `config.ts` make the
current no-op discoverable at the config key in the meantime.

When wiring the override, also normalize its input: `validate()` rejects a blank override via
`raw.trim().length === 0` but stores the untrimmed `raw`, so a padded-but-non-blank value (e.g.
`" sh.foo "`) resolves with surrounding whitespace. Because no consumer reads the resolved value
yet, this has no runtime effect today. When the override becomes consumed, store `raw.trim()` (or
reject an override whose trimmed form differs from `raw`) and add a whitespace-padded round-trip
case to `tests/runtime-config.compliance.l1.test.ts`; `arbitraryDomainLiteral()` draws no
whitespace, so the current round-trip case cannot reach it. Surfaced by changes-reviewer on pull
request (PR) #346.

## Append enumerates active sequence paths to derive the next sequence

`createJournal().append()` calls `backend.readAll()` on every append to compute
`seq = JOURNAL_SEQ_BASE + history.length`. The local Appendable backend enumerates
the current immutable sequence paths once per replay request and caches each parsed
record, so repeated appends through one backend instance do not reopen prior event
files. This re-derive-from-truth design keeps the backend authoritative, which is
what the shared-backend `SEQ_CONSUMED` rejection
([`21-event-sourced-journal.adr.md`](21-event-sourced-journal.adr.md) compliance
rule) and cursor stability rest on.

The remaining cost is one directory enumeration per append. A long active run
therefore scans a growing set of names even though its filesystem-call count and
record parsing remain linear across repeated appends. Runs currently emit a bounded
event count, and no architectural decision record (ADR) invariant requires O(1) sequence discovery.

Revisit if directory enumeration becomes observable at scale. Any index or cursor
optimization must preserve crash recovery, cursor stability across restarts, and
the shared-backend already-consumed-sequence rejection.

## The journal input-validation boundary is unspecified

`append` copies the caller-supplied CloudEvents values (`id`, `source`, `type`,
`time`) into the persisted event without value-level validation, so malformed
values such as an empty `type`, a non-Uniform Resource Identifier (URI) `source`, or a non-RFC 3339
`time` would become
journal history. `checkJournalEventConformance` and the conformance assertion
verify *structural* conformance (the attribute set, types, and stream extensions),
which the implementation satisfies; CloudEvents *value* rules (non-empty `id`/
`type`, URI-reference `source`, RFC 3339 `time`) are not asserted, and
`checkJournalEventConformance` does not deep-check that `data` is a serialisable
`JsonValue`: a function, symbol, or `undefined` on a candidate event passes the
structural check though the `JournalEvent` type forbids it.

This is a contract decision, not a defect against the current spec: does `append`
reject malformed CloudEvents values (and with what error contract), or does the
recording agent guarantee them? Settle it with an ADR + a rejection assertion
when the agent-side recording is specified (audit/review reconciliation), then
implement via `/apply`. Surfaced by automated review on PR #160.

Partially addressed at the CLI boundary on PR #226: `validateJournalEventInput`
in `src/commands/journal/cli.ts` rejects an `append` whose input lacks a required
CloudEvents input field (`id`/`source`/`type`/`time` non-empty strings, integer
`attempt`) before it reaches the journal. The deferred decision is now narrowed to
deep *value* rules for URI-reference `source`, RFC 3339 `time`, and serialisable-`JsonValue`
`data` at the library `append`, still unspecified.

## The conformance evidence validates the producer with its own module

`tests/agent-run-journal.conformance.l1.test.ts` checks each appended event with
`checkJournalEventConformance` from `src/lib/agent-run-journal/index.ts`, the module
that also produces the event and declares `CLOUDEVENTS_SPECVERSION` and the attribute
set. Changing the shared specversion constant to a value CloudEvents v1.0 forbids moves
producer and validator together, so the test still passes: the module validates itself.

**Impact:** the conformance assertion "Each appended event conforms to the CloudEvents
attribute set and the journal stream extensions" rests on no oracle independent of the
producer; only the per-field derivation checks are independent.

**Settlement condition:** the conformance evidence reads the CloudEvents v1.0 attribute
contract from an oracle outside the producer module — a schema fixture read by path or a
separately owned validator — and a specversion mutation in the producer fails the test.
Surfaced by the test-evidence audit on the allocation-under-contention changeset.

## Two evidence files own their input domains or replay policy

- `tests/runtime-config.compliance.l1.test.ts` composes the violating-override domain
  inline (`fc.oneof` of blank strings and non-string types) instead of drawing it from a
  generator under `testing/generators/`.
- `tests/agent-run-journal.conformance.l1.test.ts` draws single cases with seedless
  `fc.sample`, so a failing draw carries no replay path; the owning generator module
  exports the seeded `sampleAgentRunJournalValue`.
- `tests/agent-run-journal.property.l1.test.ts`, `tests/agent-run-journal.conformance.l1.test.ts`,
  and `tests/runtime-config.compliance.l1.test.ts` route property evidence through bare
  `fc.assert` instead of the `assertProperty` harness that owns run count, timeout, and
  `SPX_PROPERTY_SEED` replay; the concurrency and compliance files in this node use the
  harness, so the node's replay contract is split.

**Impact:** the violating classes are an author-picked partial enumeration, and a
failure in the seedless or bare-`fc.assert` cases is not replayable through the
repository's seed contract.

**Settlement condition:** the violating-override domain lives in a spec-governed
generator, every single draw uses the seeded sampler, and every property case in the node
routes through `assertProperty`. Surfaced by the test-evidence audit on the
allocation-under-contention changeset.

## Two evidence cases prove less than their assertion states

- `tests/agent-run-journal.property.l1.test.ts` (cursor read): the expected value is
  `journal.read(JOURNAL_SEQ_BASE)` filtered by cursor — the same `read` path under
  test — so a defect that alters `read` uniformly changes both sides; the events
  `append` returned are the independent oracle.
- `tests/agent-run-journal.property.l1.test.ts` (render across adapters, and sequence
  identity across backends): each "across every adapter" and "across backends" clause
  compares two instances of the one in-memory harness class; no second adapter kind,
  such as the store-backed adapter under `src/lib/appendable-journal-store/`,
  participates.

**Impact:** each case leaves one clause of its assertion unobserved.

**Settlement condition:** the cursor property derives its expectation from the appended
events; the render and sequence-identity properties bind a second adapter kind. Surfaced by the test-evidence audit on the allocation-under-contention
changeset.
