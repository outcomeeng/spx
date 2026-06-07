# Audit Module Structure

The audit domain follows the three-layer CLI composition of `spx/14-cli-composition.adr.md` — pure modules under `src/domains/audit/`, the command handler under `src/commands/audit/`, the Commander descriptor at `src/interfaces/cli/audit.ts` — with test infrastructure under `testing/harnesses/audit/`, and it depends on neither the session nor the validation domain. `src/domains/audit/config.ts` is the single source of truth for audit path components (`DEFAULT_AUDIT_CONFIG`) and also owns the node-path encoder and the verdict-timestamp formatter; `src/domains/audit/run-state.ts` owns branch identity resolution, slugging, run-directory creation, terminal `state.json` writing, branch run-state lookup, and latest-terminal-run selection.

## Rationale

Keeping audit config in an audit-owned descriptor maintains the domain's self-containment: the config registry composes descriptors, so audit artifacts stay domain-specific while still resolving through the shared config APIs. `encodeNodePath` — the pure function converting a spec node path to a directory name by replacing every `/` with `-` — lives in `config.ts` because `DEFAULT_AUDIT_CONFIG.storage.spxDir` and `.storage.nodesDir` are the values that give encoding its meaning, and both the production verify pipeline and the test harness import it from there for consistent encoding. `run-state.ts` keeps branch-scoped execution history separate from node-first verdict verification, importing descriptor-owned storage defaults from `config.ts` and owning the algorithms over branch identities, run ids, terminal state, and latest-run ordering. `testing/harnesses/audit/harness.ts` exports `AuditHarness` (`productDir`, `nodeDir`, `writeVerdict`, `cleanup`) and the `createAuditHarness` factory, with all path construction delegating to `DEFAULT_AUDIT_CONFIG` and `encodeNodePath`.

Verdict naming splits into two independent entries — `verdictFile` for the well-known filename inside a run directory and `verdictFileSuffix` for node-first artifacts under `.spx/nodes/` — because the run-directory case and the node-first case share no stem. `formatAuditTimestamp` uses UTC because verdict files are sorted lexicographically to find the latest audit and agents run across timezones, so local timestamps would order non-reproducibly, and its injectable clock lets `l1` tests assert the exact filename `writeVerdict` produces. Rejecting unknown audit-owned keys before defaults merge turns a misspelled execution setting into an early failure rather than a silently ignored value, and resolving the default target filter through `validatePathFilterConfig({})` makes the descriptor default fail at import time rather than drift if the shared primitive changes its empty-filter acceptance.

Rejected: placing `encodeNodePath` under a `paths/` module (encoding is a direct consequence of the config shape, so co-locating it with the config makes the dependency obvious); splitting the branch run-state helpers across modules (keeping branch identity, storage, and lookup together while leaving config ownership in `config.ts` is the cleaner seam); and defining audit settings outside the descriptor system (a descriptor keeps audit settings discoverable through shared config APIs without centralizing domain rules).

## Invariants

- `encodeNodePath` is a pure function: the same input always produces the same output, with no side effects.
- `src/domains/audit/run-state.ts` uses descriptor-owned storage defaults and never redefines audit path-component strings.
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
- ALWAYS: import branch run-state APIs from `src/domains/audit/run-state.ts` in all branch-scoped audit consumers — no duplicate branch-slugging, run-directory, terminal-state, or latest-run lookup definitions ([audit])
- ALWAYS: keep `src/domains/audit/run-state.ts` dependent on the audit config descriptor defaults for the `.spx`, `audit`, `runs`, and `state.json` path components ([audit])
- ALWAYS: reject unknown keys in audit-owned config objects before merging descriptor defaults; unknown keys inside the shared `audit.targets` follow the shared path-filter primitive's policy ([audit])
- NEVER: parse raw `spx.config.*` files in audit-domain code — config-owned APIs resolve descriptor values ([audit])
- NEVER: hardcode `.spx`, `nodes`, or `.audit.xml` as string literals outside `DEFAULT_AUDIT_CONFIG` ([audit])
- NEVER: hardcode `audit`, `runs`, or `state.json` as string literals outside `DEFAULT_AUDIT_CONFIG` ([audit])
- NEVER: use `getFullYear`/`getHours` (local time) in `formatAuditTimestamp` — breaks timezone-independent ordering ([audit])
