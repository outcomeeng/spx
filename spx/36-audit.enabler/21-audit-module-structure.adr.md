# Audit Module Structure

## Purpose

This decision governs the TypeScript module layout for the audit domain: where `DEFAULT_AUDIT_CONFIG` is defined, where branch run state lives, where path encoding lives, and how the test harness is placed.

## Context

**Business impact:** `DEFAULT_AUDIT_CONFIG` is mandated as the single source of truth for audit path components. Without a decision on its TypeScript location and shape, every consumer independently invents the structure.

**Technical constraints:** The audit domain is self-contained — it does not depend on `src/session/` or `src/validation/`. Path encoding (spec node path → directory name) is a pure function used by both test infrastructure and the production verify pipeline. Branch run-state storage uses Git common-dir product roots, branch slugs, exclusive run-directory creation, terminal `state.json` files, and latest-run ordering from `spx/36-audit.enabler/15-audit-directory.adr.md`. Timestamp generation for verdict filenames must use UTC components to ensure timezone-independent lexicographic ordering.

## Decision

The audit production module tree under `src/domains/audit/` owns runtime audit code. Audit test infrastructure lives under `testing/harnesses/audit/`.

`src/domains/audit/config.ts` exports the audit config descriptor, the audit config constant, the path-encoding function, and the timestamp formatter for node-first verdict artifacts.

`src/domains/audit/run-state.ts` exports branch identity resolution, branch slugging, audit run-directory creation, terminal `state.json` writing, branch run-state lookup, and latest terminal-run selection.

`DEFAULT_AUDIT_CONFIG` is an `as const` typed constant with descriptor-owned storage defaults, base-ref defaults, branch-slug defaults, auditor defaults, and target-filter defaults. Storage defaults include the `.spx` directory name, the `nodes` subdirectory name, audit/run state directory names, verdict filenames, and state filenames.

`verdictFile` and `verdictFileSuffix` are separate storage vocabulary entries. `verdictFile` is the stable filename used when an audit run needs a well-known verdict artifact name inside a run directory. `verdictFileSuffix` is the suffix appended to timestamp stems for node-first verdict artifacts under `.spx/nodes/`. They may be configured independently; no cross-field suffix relationship is enforced.

Audit descriptor validators reject unknown keys at the `audit`, `audit.storage`, and `audit.branchSlug` levels. The stricter field policy catches misspelled audit execution settings before an audit run records state or computes descriptor digests. The shared target path-filter primitive retains its own structural policy and ignores unknown keys inside `audit.targets`.

`encodeNodePath` is a pure function that converts a spec node path to a filesystem directory name by replacing every `/` with `-`.

`formatAuditTimestamp` generates a `YYYY-MM-DD_HH-mm-ss` string using UTC components and accepts an optional injectable clock for deterministic testing.

`testing/harnesses/audit/harness.ts` exports `AuditHarness` (an interface with `productDir`, `nodeDir`, `writeVerdict`, and `cleanup` members) and the `createAuditHarness` factory. All path construction in the harness delegates to `DEFAULT_AUDIT_CONFIG` and `encodeNodePath`.

## Rationale

Keeping audit config in an audit-owned descriptor maintains the audit domain's self-containment. The config registry composes descriptors; audit artifacts stay domain-specific while still resolving through the shared config APIs.

Placing `encodeNodePath` in `config.ts` co-locates it with the config it derives from — `DEFAULT_AUDIT_CONFIG.storage.spxDir` and `DEFAULT_AUDIT_CONFIG.storage.nodesDir` are the values that give encoding its meaning. The production verify pipeline and the test harness both import from `config.ts`, ensuring consistent encoding.

Keeping branch run state in `run-state.ts` separates branch-scoped execution history from node-first verdict verification. The module imports descriptor-owned storage defaults from `config.ts` and owns the algorithms that operate on branch identities, run ids, terminal state files, and latest-run ordering.

Resolving the default target filter through `validatePathFilterConfig({})` makes descriptor defaults use the same canonical path-filter shape as configured values. If the shared primitive changes its acceptance rules for the empty filter, the audit descriptor default fails at import time instead of drifting from configured target resolution.

UTC timestamps are required because verdict files are lexicographically sorted to find the latest audit, and agents run across timezones. Local timestamps would produce non-reproducible orderings when comparing verdicts from different machines.

The injectable clock in `formatAuditTimestamp` enables `l1` tests to verify the exact filename produced by `writeVerdict` without relying on real wall-clock time.

## Trade-offs accepted

| Trade-off                                       | Mitigation / reasoning                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Audit config registered as a descriptor         | Keeps audit settings discoverable through shared config APIs without centralizing domain rules        |
| `encodeNodePath` in `config.ts` not in `paths/` | Encoding is a direct consequence of the config shape; co-location makes the dependency obvious        |
| Branch run-state helpers in one module          | Keeps branch identity, storage, and lookup semantics together while leaving config ownership separate |
| Unknown audit keys are rejected                 | Misspelled audit execution settings fail before they affect persisted audit state or digests          |

## Invariants

- `encodeNodePath` is a pure function: same input always produces same output, no side effects
- `src/domains/audit/run-state.ts` uses descriptor-owned storage defaults and never redefines audit path component strings
- Each exclusive-created audit run directory has exactly one terminal state writer; concurrent terminal writers for the same run directory are outside the audit run-state contract
- `DEFAULT_AUDIT_CONFIG` is `as const` — never mutated at runtime
- Audit descriptor validators reject unknown audit-owned keys before merging descriptor defaults
- `formatAuditTimestamp` uses `getUTC*` methods — timezone-independent

## Compliance

### Recognized by

`DEFAULT_AUDIT_CONFIG`, `encodeNodePath`, and `formatAuditTimestamp` originate from the audit config module. Branch run-state consumers import branch identity, slugging, storage, terminal-state, and lookup APIs from the audit run-state module. No path-component string literals appear at call sites.

### MUST

- Export `DEFAULT_AUDIT_CONFIG` from `src/domains/audit/config.ts` — single source of truth for audit path components ([review])
- Implement `encodeNodePath` as a pure function with no side effects — enables `l1` property testing ([review])
- Use UTC methods (`getUTCFullYear`, `getUTCMonth`, etc.) in `formatAuditTimestamp` — timezone-independent sorting ([review])
- Accept optional `now?: () => Date` in `formatAuditTimestamp` — injectable clock for deterministic `l1` tests ([review])
- Import `DEFAULT_AUDIT_CONFIG`, `encodeNodePath`, and `formatAuditTimestamp` from `src/domains/audit/config.ts` in all consumers — no duplicate definitions ([review])
- Import branch run-state APIs from `src/domains/audit/run-state.ts` in all branch-scoped audit consumers — no duplicate branch slugging, run-directory, terminal-state, or latest-run lookup definitions ([review])
- Keep `src/domains/audit/run-state.ts` dependent on the audit config descriptor defaults for `.spx`, `audit`, `runs`, and `state.json` path components ([review])
- Reject unknown keys in audit-owned config objects before merging descriptor defaults; unknown keys inside shared `audit.targets` follow the shared path-filter primitive's policy ([review])

### NEVER

- Parse raw `spx.config.*` files in audit-domain code — config-owned APIs resolve descriptor values ([review])
- Hardcode `.spx`, `nodes`, or `.audit.xml` as string literals outside `DEFAULT_AUDIT_CONFIG` — single source of truth for all audit path components ([review])
- Hardcode `audit`, `runs`, or `state.json` as string literals outside `DEFAULT_AUDIT_CONFIG` — branch run-state storage uses descriptor-owned path components ([review])
- Use `getFullYear`/`getHours` (local time) in `formatAuditTimestamp` — breaks timezone-independent ordering ([review])
