# Verify Module Structure

The verify command follows the three-layer CLI composition of `spx/14-cli-composition.adr.md`: pure type, scope, lifecycle, finding, idempotency, and projection rules live under `src/domains/verify/`; process-agnostic orchestration over verification-context and journal capabilities lives under `src/commands/verify/`; and the Commander descriptor lives at `src/interfaces/cli/verify.ts`. The verify domain owns public verification-run validation while journal and verification-context remain substrate domains consumed through injected boundaries.

## Rationale

The public verify lifecycle has product-specific rules that do not belong in the raw journal channel: verification-type validation, changeset scope mapping, append-payload validation, terminal-status validation, finding-schema validation, lifecycle legality, and idempotent append semantics. Keeping those rules in `src/domains/verify/` lets the public interface verify without filesystem, process, or backend I/O, while the command layer composes existing context and journal capabilities.

Per-verification-type finding validation dispatches through a typed finding-validator registry keyed by verification type, so a new verification type registers a validator without editing dispatch control flow — the static-registration discipline `spx/14-cli-composition.adr.md` and `spx/19-language-registration.adr.md` apply to domains and languages, and the verify-domain analogue of the verification-type-name-branching prohibition `spx/34-verification.enabler/13-journal-channel.adr.md` states for the journal layer.

A verification run has a single sequential driver: the caller that starts a run drives its appends and terminal completion in order. The journal channel of `spx/34-verification.enabler/13-journal-channel.adr.md` routes a run through one driving skill emitting to one backend-neutral channel; this ADR fixes the concurrency premise that follows for the verify command — one run has one sequential driver, not concurrent writers. Append idempotency is therefore a pre-append read of the run's event history that returns the existing sequence for a repeated idempotency key — a check-then-act sufficient for a driver's sequential retries, which is the exactly-once-per-caller-intent the node declares. A run's concurrency is expressed as separate runs with their own tokens, never as concurrent writers appending to one run, so the command layer enforces idempotency without an atomic storage-layer dedup.

## Invariants

- `src/domains/verify/` accesses no filesystem, git process, process globals, command modules, journal storage, or verification-context storage.
- `src/commands/verify/` consumes verification-context and journal capabilities through injected dependencies and never constructs backend transports directly.
- `src/interfaces/cli/verify.ts` is the only verify module that parses Commander options, standard input, standard output, standard error, or process exit behavior.
- Verifier execution remains outside the verify module; the command records and renders caller-driven work.
- Finding-payload validation dispatches through a finding-validator registry keyed by verification type; adding a verification type's finding validation adds one registry entry and changes no verify dispatch control flow.
- A verification run has one sequential driver; append idempotency is a check-then-act over the run's event history that suffices for a driver's sequential retries, not for concurrent writers to one run.

## Verification

### Audit

- ALWAYS: verification type, scope type, append payload, terminal status, lifecycle legality, finding validation, and idempotency rules live in `src/domains/verify/` as pure functions with no filesystem, process, or command-layer imports ([audit])
- ALWAYS: verification-type-specific finding-payload validation dispatches through a statically typed, explicitly enumerated finding-validator registry keyed by verification type, so `src/domains/verify/` selects a finding validator by registry lookup rather than verification-type-name branching ([audit])
- ALWAYS: append idempotency is enforced by a pre-append read of the run's event history that returns the existing sequence for a repeated idempotency key of the same append kind, so an append-scope and an append-finding never satisfy each other's idempotency check even when a caller reuses one key across both verbs; the check is valid because this ADR decides a verification run has a single sequential driver, and run concurrency is separate runs, never concurrent writers to one run ([audit])
- ALWAYS: `src/commands/verify/` orchestrates verification-context creation and journal operations through injected ports, so tests can exercise real verify behavior against controlled dependencies ([audit])
- ALWAYS: `src/interfaces/cli/verify.ts` owns Commander registration and process-boundary parsing for the `verify` command, and imports command handlers rather than domain internals directly ([audit])
- NEVER: verify domain code imports from `src/commands/verify/`, `src/interfaces/cli/`, `src/domains/journal/` storage adapters, or `src/domains/verification-context/` storage adapters ([audit])
- NEVER: verify command modules construct GitHub, artifact, local filesystem, or stdout backends directly; backend binding remains owned by the journal substrate ([audit])
- ALWAYS: a `spx verify` append verb writes its single structured JSON result to standard output and routes the local backend's event stream to standard error, so a caller parses one JSON result on stdout while the run stays observable ([audit])
- NEVER: verify command modules spawn, configure, or select a verifier agent ([audit])
- NEVER: verify domain or command code branches on a verification-type name to select finding validation — a new verification type adds a finding-validator registry entry, the verify-domain analogue of the journal-layer prohibition in `spx/34-verification.enabler/13-journal-channel.adr.md` ([audit])
