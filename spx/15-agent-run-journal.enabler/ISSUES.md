# Issues: Agent Run Journal

## FOLLOW-UP — the `runtime.eventNamespace` override is validated but not yet consumed

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
case to `tests/runtime-config.compliance.l1.test.ts` — `arbitraryDomainLiteral()` draws no
whitespace, so the current round-trip case cannot reach it. Surfaced by changes-reviewer on PR #346.

## FOLLOW-UP — append re-reads the full history to derive the next sequence

`createJournal().append()` calls `backend.readAll()` on every append to compute
`seq = JOURNAL_SEQ_BASE + history.length`, so a run of n appends performs O(n²)
backend reads. This re-derive-from-truth design is deliberate: it keeps the
backend authoritative, which is what the shared-backend `SEQ_CONSUMED` rejection
([`21-event-sourced-journal.adr.md`](21-event-sourced-journal.adr.md) compliance
rule) and cursor stability rest on.

Impact is currently low: every append targets a runner-local Appendable JSONL
run file — the GitHub Appendable backend of
`spx/21-infrastructure.enabler/43-github-ci.enabler/21-artifact-journal-store.enabler`
appends to that same runner-local file during a job and retains it as a durable
artifact only at seal — so the `readAll` cost is a local-file read under both
backends, and a run emits a bounded event count. No ADR invariant requires O(1)
append.

Revisit if a backend's `readAll` cost becomes observable at scale. Any
optimization (e.g. lazy-initialised
local sequence caching) MUST preserve cursor stability across restarts and the
shared-backend already-consumed-sequence rejection — a single journal per run is
the design's single-writer assumption, not a guarantee the type enforces.

## FOLLOW-UP — the journal's input-validation boundary is unspecified

`append` copies the caller-supplied CloudEvents values (`id`, `source`, `type`,
`time`) into the persisted event without value-level validation, so malformed
values — an empty `type`, a non-URI `source`, a non-RFC3339 `time` — would become
journal history. `checkJournalEventConformance` and the conformance assertion
verify *structural* conformance (the attribute set, types, and stream extensions),
which the implementation satisfies; CloudEvents *value* rules (non-empty `id`/
`type`, URI-reference `source`, RFC3339 `time`) are not asserted, and
`checkJournalEventConformance` does not deep-check that `data` is a serialisable
`JsonValue` — a function, symbol, or `undefined` on a candidate event passes the
structural check though the `JournalEvent` type forbids it.

This is a contract decision, not a defect against the current spec: does `append`
reject malformed CloudEvents values (and with what error contract), or does the
recording agent guarantee them? Settle it with an ADR + a rejection assertion
when the agent-side recording is specified (audit/review reconciliation), then
implement via `/applying`. Surfaced by Codex review on PR #160.

Partially addressed at the CLI boundary on PR #226: `validateJournalEventInput`
in `src/commands/journal/cli.ts` rejects an `append` whose input lacks a required
CloudEvents input field (`id`/`source`/`type`/`time` non-empty strings, integer
`attempt`) before it reaches the journal. The deferred decision is now narrowed to
deep *value* rules — URI-reference `source`, RFC3339 `time`, serialisable-`JsonValue`
`data` — at the library `append`, still unspecified.

## FOLLOW-UP — seal enforcement has a time-of-check/time-of-use window

`createJournal().append()` checks `backend.isSealed()` and then `backend.append()`
in separate awaited steps; the backend gates only sequence exclusivity, not seal.
Under a concurrent `seal()` interleaved between the check and the persist, an
append can resolve after the stream is sealed, so the terminal-seal invariant
([`21-event-sourced-journal.adr.md`](21-event-sourced-journal.adr.md)) is not
race-proof.

The invariant holds for the supported usage — one journal per run, a single
writer, `seal()` after the last append — which the compliance test verifies.
Closing the window (an atomic check-and-append, or backend-level seal rejection)
is the same single-writer-vs-concurrent decision as the sequence-caching and
input-validation follow-ups above; settle them together when a backend admits
concurrent writers. Surfaced by Codex review on PR #160.

## FOLLOW-UP — the backend's consumed-sequence error contract is implicit

`AppendableBackend.append` is documented as rejecting a record whose `seq` is
already consumed, but the interface names no error type or message; the journal
propagates the backend's error unchanged. The compliance test asserts the thrown
message equals `JOURNAL_ERROR.SEQ_CONSUMED`, which holds only because the
in-memory backend imports and throws that exact constant. A real adapter
(state-store, GitHub) that surfaced its own storage error would prevent the
overwrite correctly yet break the test.

Settle when the first real Appendable adapter is implemented: either document a
required error type/message on `AppendableBackend.append` for the consumed-seq
case, or have the journal catch and re-throw a typed `JournalError` so the
contract is the journal's, not each backend's. Surfaced by spec-tree-review on
PR #160.
