# Audit Module Structure

The audit command family follows the three-layer CLI composition of `spx/14-cli-composition.adr.md` — pure modules under `src/domains/audit/`, process-agnostic filesystem orchestration under `src/commands/audit/`, and the Commander descriptor at `src/interfaces/cli/audit.ts` — with test infrastructure under `testing/harnesses/audit/`, and it depends on neither the session nor the validation domain. `src/domains/audit/config.ts` is the single source of truth for audit path components (`DEFAULT_AUDIT_CONFIG`) and also owns the node-path encoder and the verdict-timestamp formatter; `src/domains/audit/run-state.ts` owns branch identity resolution, slugging, run-id and timestamp construction, run-state validation and classification, and latest-terminal-run selection. `src/commands/audit/run-state.ts` owns branch run-directory creation, terminal `state.json` writing, and branch run-state lookup.

## Rationale

Keeping audit config in an audit-owned descriptor maintains the domain's self-containment: the config registry composes descriptors, so audit artifacts stay domain-specific while still resolving through the shared config APIs. `encodeNodePath` — the pure function converting a spec node path to a directory name by replacing every `/` with `-` — lives in `config.ts` because `DEFAULT_AUDIT_CONFIG.storage.spxDir` and `.storage.nodesDir` are the values that give encoding its meaning, and both the verify command handler and the test harness import it from there for consistent encoding. `run-state.ts` keeps branch-scoped execution algorithms separate from node-first verdict verification, importing descriptor-owned storage defaults from `config.ts` and owning pure rules over branch identities, run ids, terminal state, and latest-run ordering. `src/commands/audit/run-state.ts` composes those pure rules with filesystem operations, which keeps command handlers testable with temporary directories while leaving domain modules free of filesystem access. `testing/harnesses/audit/harness.ts` exports `AuditHarness` (`productDir`, `nodeDir`, `writeVerdict`, `cleanup`) and the `createAuditHarness` factory, with all path construction delegating to `DEFAULT_AUDIT_CONFIG` and `encodeNodePath`.

Verdict naming splits into two independent entries — `verdictFile` for the well-known filename inside a run directory and `verdictFileSuffix` for node-first artifacts under `.spx/nodes/` — because the run-directory case and the node-first case share no stem. `formatAuditTimestamp` uses UTC because verdict files are sorted lexicographically to find the latest audit and agents run across timezones, so local timestamps would order non-reproducibly, and its injectable clock lets `l1` tests assert the exact filename `writeVerdict` produces. Rejecting unknown audit-owned keys before defaults merge turns a misspelled execution setting into an early failure rather than a silently ignored value, and resolving the default target filter through `validatePathFilterConfig({})` makes the descriptor default fail at import time rather than drift if the shared primitive changes its empty-filter acceptance.

Rejected: placing `encodeNodePath` under a `paths/` module (encoding is a direct consequence of the config shape, so co-locating it with the config makes the dependency obvious); putting filesystem orchestration in `src/domains/audit/run-state.ts` (direct filesystem access violates the CLI composition boundary); and defining audit settings outside the descriptor system (a descriptor keeps audit settings discoverable through shared config APIs without centralizing domain rules).

## Invariants

- `encodeNodePath` is a pure function: the same input always produces the same output, with no side effects.
- `src/domains/audit/run-state.ts` uses descriptor-owned storage defaults and never redefines audit path-component strings.
- `src/domains/audit/run-state.ts` never accesses the filesystem or process.
- `src/commands/audit/run-state.ts` is the branch run-state storage orchestrator.
- `DEFAULT_AUDIT_CONFIG` is never mutated at runtime.
- `verdictFile` and `verdictFileSuffix` are independent storage-vocabulary entries; no cross-field suffix relationship is enforced between them.
- Each exclusive-created audit run directory has exactly one terminal state writer; sequential duplicate terminal writes are rejected, and concurrent terminal writers for the same run directory are prevented by the one-owner run-directory invariant.
- Audit descriptor validators reject unknown audit-owned keys before merging descriptor defaults.
- `formatAuditTimestamp` uses `getUTC*` methods — timezone-independent.

## Verification

### Audit

- ALWAYS: export `DEFAULT_AUDIT_CONFIG` from `src/domains/audit/config.ts` — single source of truth for audit path components ([audit])
- ALWAYS: implement `encodeNodePath` as a pure function with no side effects — enables `l1` property testing ([audit])
- ALWAYS: use UTC methods (`getUTCFullYear`, `getUTCMonth`, etc.) in `formatAuditTimestamp` — timezone-independent sorting ([audit])
- ALWAYS: accept optional `now?: () => Date` in `formatAuditTimestamp` — injectable clock for deterministic `l1` tests ([audit])
- ALWAYS: import `DEFAULT_AUDIT_CONFIG`, `encodeNodePath`, and `formatAuditTimestamp` from `src/domains/audit/config.ts` in all consumers — no duplicate definitions ([audit])
- ALWAYS: import branch run-state pure APIs from `src/domains/audit/run-state.ts` in all branch-scoped audit consumers — no duplicate branch-slugging, run-state validation, terminal-state classification, or latest-run ordering definitions ([audit])
- ALWAYS: import branch run-state filesystem APIs from `src/commands/audit/run-state.ts` in all branch-scoped audit consumers that create run directories, write terminal state, or read persisted branch runs ([audit])
- ALWAYS: keep `src/domains/audit/run-state.ts` dependent on the audit config descriptor defaults for the `.spx`, `audit`, `runs`, and `state.json` path components ([audit])
- ALWAYS: reject unknown keys in audit-owned config objects before merging descriptor defaults; unknown keys inside the shared `audit.targets` follow the shared path-filter primitive's policy ([audit])
- NEVER: parse raw `spx.config.*` files in audit-domain code — config-owned APIs resolve descriptor values ([audit])
- NEVER: import `node:fs`, `node:fs/promises`, process globals, or `src/commands/audit/` from any module under `src/domains/audit/` ([audit])
- NEVER: hardcode `.spx`, `nodes`, or `.audit.xml` as string literals outside `DEFAULT_AUDIT_CONFIG` ([audit])
- NEVER: hardcode `audit`, `runs`, or `state.json` as string literals outside `DEFAULT_AUDIT_CONFIG` ([audit])
- NEVER: use `getFullYear`/`getHours` (local time) in `formatAuditTimestamp` — breaks timezone-independent ordering ([audit])
