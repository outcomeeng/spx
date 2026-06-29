# Verify Module Structure

The verify command follows the three-layer CLI composition of `spx/14-cli-composition.adr.md`: pure type, scope, lifecycle, finding, idempotency, and projection rules live under `src/domains/verify/`; process-agnostic orchestration over verification-context and journal capabilities lives under `src/commands/verify/`; and the Commander descriptor lives at `src/interfaces/cli/verify.ts`. The verify domain owns public verification-run validation while journal and verification-context remain substrate domains consumed through injected boundaries.

## Rationale

The public verify lifecycle has product-specific rules that do not belong in the raw journal channel: verification-type validation, changeset and working-tree scope mapping, finding-schema validation, lifecycle legality, and idempotent append semantics. Keeping those rules in `src/domains/verify/` lets the public interface verify without filesystem, process, or backend I/O, while the command layer composes existing context and journal capabilities.

## Invariants

- `src/domains/verify/` accesses no filesystem, git process, process globals, command modules, journal storage, or verification-context storage.
- `src/commands/verify/` consumes verification-context and journal capabilities through injected dependencies and never constructs backend transports directly.
- `src/interfaces/cli/verify.ts` is the only verify module that parses Commander options, standard input, standard output, standard error, or process exit behavior.
- Verifier execution remains outside the verify module; the command records and renders caller-driven work.

## Verification

### Audit

- ALWAYS: verification type, scope type, lifecycle legality, finding validation, and idempotency rules live in `src/domains/verify/` as pure functions with no filesystem, process, or command-layer imports ([audit])
- ALWAYS: `src/commands/verify/` orchestrates verification-context creation and journal operations through injected ports, so tests can exercise real verify behavior against controlled dependencies ([audit])
- ALWAYS: `src/interfaces/cli/verify.ts` owns Commander registration and process-boundary parsing for the `verify` command, and imports command handlers rather than domain internals directly ([audit])
- NEVER: verify domain code imports from `src/commands/verify/`, `src/interfaces/cli/`, `src/domains/journal/` storage adapters, or `src/domains/verification-context/` storage adapters ([audit])
- NEVER: verify command modules construct GitHub, artifact, local filesystem, or stdout backends directly; backend binding remains owned by the journal substrate ([audit])
- NEVER: verify command modules spawn, configure, or select a verifier agent ([audit])
