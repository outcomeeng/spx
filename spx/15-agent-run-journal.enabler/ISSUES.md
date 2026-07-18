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

## The backend consumed-sequence error contract is implicit

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
