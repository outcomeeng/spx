# Audit Module Structure

The audit command family follows the three-layer CLI composition of `spx/14-cli-composition.adr.md` — pure modules under `src/domains/audit/` and process-agnostic filesystem orchestration under `src/commands/audit/`, with test infrastructure under `testing/harnesses/audit/`; a Commander descriptor at `src/interfaces/cli/audit.ts` joins the CLI registry when audit exposes an implemented subcommand, per `spx/36-audit.enabler/76-audit-cli.enabler/21-audit-cli.adr.md`. Audit binds each run to the appendable journal store of `spx/18-state.enabler/71-appendable-journal-store.enabler/` and consumes `src/lib/state-store/` for branch identity, branch slugs, and run-file paths; the audit-owned config descriptor carries only execution settings — base ref, auditors, and target filters.

## Rationale

Scoping the audit-owned config descriptor to execution settings keeps audit domain-specific while shared store mechanics live in the state-store provider and the journal binding lives in the appendable journal store. `src/domains/audit/run-state.ts` owns the pure rules — the `AuditRunState` projection fold over a run's events, terminal-status validation, and latest-run ordering — importing state-store helpers for branch scope and run-file naming while accessing no filesystem or process. `src/commands/audit/run-state.ts` composes those pure rules with the appendable journal store: it binds a run file path to the store, appends the run's events, seals at terminal completion, and reads a branch's runs back by folding each stream's projection. Concentrating filesystem and journal wiring in the command layer keeps the domain layer verifiable over in-memory events without a real repository.

Rejected: a bespoke terminal-record writer in the domain layer (the journal store owns append, seal, and read, so audit folds a projection rather than serializing its own record); duplicating branch slugging and run-file storage inside audit (state-store owns cross-consumer local-state mechanics); and defining audit settings outside the descriptor system (a descriptor keeps audit settings discoverable through shared config APIs).

## Invariants

- `src/domains/audit/run-state.ts` accesses no filesystem or process; it operates only on in-memory events and run records.
- `src/commands/audit/run-state.ts` is the sole audit module that binds the appendable journal store and performs run-file I/O.
- The `AuditRunState` projection fold is pure: the same events always produce the same envelope.
- `DEFAULT_AUDIT_CONFIG` is never mutated at runtime, and audit descriptor validators reject unknown audit-owned keys before merging defaults.

## Verification

### Audit

- ALWAYS: keep audit's pure rules — `AuditRunState` projection fold, terminal-status validation, latest-run ordering — in `src/domains/audit/run-state.ts`, depending on state-store helpers for branch identity, slugging, and run-file naming ([audit])
- ALWAYS: bind the appendable journal store and perform all run-file reads and writes in `src/commands/audit/run-state.ts`, the branch-run-state storage orchestrator ([audit])
- ALWAYS: scope the audit config descriptor to execution settings — base ref, auditors, target filters — resolved through the config descriptor system per `spx/16-config.enabler/21-descriptor-registration.adr.md` ([audit])
- ALWAYS: accept the journal store and filesystem as injected dependencies so audit run-state verifies over a controlled filesystem and run path without a real repository ([audit])
- NEVER: import `node:fs`, `node:fs/promises`, process globals, or `src/commands/audit/` from any module under `src/domains/audit/` ([audit])
- NEVER: serialize a bespoke terminal audit record outside the journal store's append and seal contract ([audit])
- NEVER: define node-first verdict-path vocabulary (`nodesDir`, `verdictFile`, verdict-file suffixes) or a spec-node-path encoder in audit code — audit persists only branch-scoped run journals ([audit])
- NEVER: parse raw `spx.config.*` files in audit-domain code — config-owned APIs resolve descriptor values ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or `memfs` for the filesystem or journal store — tests inject controlled implementations and exercise the real code paths ([audit])
