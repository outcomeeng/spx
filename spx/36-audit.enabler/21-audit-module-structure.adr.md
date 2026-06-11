# Audit Module Structure

The audit command family follows the three-layer CLI composition of `spx/14-cli-composition.adr.md` — pure modules under `src/domains/audit/`, process-agnostic filesystem orchestration under `src/commands/audit/`, and the Commander descriptor at `src/interfaces/cli/audit.ts` — with test infrastructure under `testing/harnesses/audit/`. Audit consumes `src/lib/state-store/` for branch identity, branch slugs, run-file paths, and JSONL record mechanics, while audit-owned config remains the source of truth for node-first verdict artifact paths.

## Rationale

Keeping audit config in an audit-owned descriptor keeps audit artifacts domain-specific while shared store mechanics live in the state-store provider. `encodeNodePath` — the pure function converting a spec node path to a directory name by replacing every `/` with `-` — lives in `config.ts` because `DEFAULT_AUDIT_CONFIG.storage.nodesDir` is the audit-owned value that gives node-first encoding its meaning, and both the production verify pipeline and the test harness import it from there for consistent encoding. `run-state.ts` keeps branch-scoped execution history separate from node-first verdict verification, importing state-store helpers for branch scope and run-file naming while owning audit terminal-state validation and latest-run ordering. `src/commands/audit/run-state.ts` composes those pure rules with filesystem-backed state-store helpers for run-file creation, terminal JSONL writes, and branch run-state lookup.

`testing/harnesses/audit/harness.ts` exports `AuditHarness` (`productDir`, `nodeDir`, `writeVerdict`, `cleanup`) and the `createAuditHarness` factory, with node-first path construction delegating to `DEFAULT_AUDIT_CONFIG` and `encodeNodePath`. Verdict naming keeps `verdictFile` for the well-known explicit-verification filename and `verdictFileSuffix` for timestamped node-first artifacts under `.spx/nodes/`. Branch run files are state-store artifacts and carry their own `run-{run-token}.jsonl` names. `formatAuditTimestamp` uses UTC because verdict files are sorted lexicographically to find the latest audit and agents run across timezones, so local timestamps would order non-reproducibly, and its injectable clock lets `l1` tests assert the exact filename `writeVerdict` produces. Rejecting unknown audit-owned keys before defaults merge turns a misspelled execution setting into an early failure rather than a silently ignored value, and resolving the default target filter through `validatePathFilterConfig({})` makes the descriptor default fail at import time rather than drift if the shared primitive changes its empty-filter acceptance.

Rejected: placing `encodeNodePath` under a `paths/` module (encoding is a direct consequence of the config shape, so co-locating it with the config makes the dependency obvious); duplicating branch slugging and run-file storage inside audit (state-store owns cross-consumer local-state mechanics); and defining audit settings outside the descriptor system (a descriptor keeps audit settings discoverable through shared config APIs without centralizing domain rules).

## Invariants

- `encodeNodePath` is a pure function: the same input always produces the same output, with no side effects.
- `src/domains/audit/run-state.ts` uses state-store defaults for branch run path tokens and descriptor-owned defaults only for node-first verdict path tokens.
- `src/domains/audit/run-state.ts` never accesses the filesystem or process.
- `src/commands/audit/run-state.ts` is the branch run-state storage orchestrator.
- `DEFAULT_AUDIT_CONFIG` is never mutated at runtime.
- `verdictFile` and `verdictFileSuffix` are independent node-first verdict vocabulary entries; no cross-field suffix relationship is enforced between them.
- Each exclusive-created audit run file has exactly one terminal state writer; duplicate terminal writes are rejected by exclusive create semantics.
- Audit descriptor validators reject unknown audit-owned keys before merging descriptor defaults.
- `formatAuditTimestamp` uses `getUTC*` methods — timezone-independent.

## Verification

### Audit

- ALWAYS: export `DEFAULT_AUDIT_CONFIG` from `src/domains/audit/config.ts` — single source of truth for audit-owned node-first verdict path components ([audit])
- ALWAYS: implement `encodeNodePath` as a pure function with no side effects — enables `l1` property testing ([audit])
- ALWAYS: use UTC methods (`getUTCFullYear`, `getUTCMonth`, etc.) in `formatAuditTimestamp` — timezone-independent sorting ([audit])
- ALWAYS: accept optional `now?: () => Date` in `formatAuditTimestamp` — injectable clock for deterministic `l1` tests ([audit])
- ALWAYS: import `DEFAULT_AUDIT_CONFIG`, `encodeNodePath`, and `formatAuditTimestamp` from `src/domains/audit/config.ts` in all consumers — no duplicate definitions ([audit])
- ALWAYS: import branch run-state pure APIs from `src/domains/audit/run-state.ts` in all branch-scoped audit consumers — no duplicate terminal-state validation or latest-run ordering definitions ([audit])
- ALWAYS: import branch run-state filesystem APIs from `src/commands/audit/run-state.ts` in all branch-scoped audit consumers that create run files, write terminal state, or read persisted branch runs ([audit])
- ALWAYS: keep `src/domains/audit/run-state.ts` dependent on state-store helpers for branch identity, branch slugging, run-file naming, and terminal-record conversion ([audit])
- ALWAYS: keep `src/commands/audit/run-state.ts` dependent on state-store helpers for `.spx`, `branch`, `runs`, `run-`, `.jsonl`, and JSONL mechanics ([audit])
- ALWAYS: reject unknown keys in audit-owned config objects before merging descriptor defaults; unknown keys inside the shared `audit.targets` follow the shared path-filter primitive's policy ([audit])
- NEVER: parse raw `spx.config.*` files in audit-domain code — config-owned APIs resolve descriptor values ([audit])
- NEVER: import `node:fs`, `node:fs/promises`, process globals, or `src/commands/audit/` from any module under `src/domains/audit/` ([audit])
- NEVER: hardcode `.spx`, `nodes`, or `.audit.xml` as string literals outside `DEFAULT_AUDIT_CONFIG` ([audit])
- NEVER: hardcode `branch`, `audit`, `runs`, `run-`, or `.jsonl` as string literals outside source-owned defaults ([audit])
- NEVER: use `getFullYear`/`getHours` (local time) in `formatAuditTimestamp` — breaks timezone-independent ordering ([audit])
