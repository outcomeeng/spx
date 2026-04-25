# Audit Module Structure

## Purpose

This decision governs the TypeScript module layout for the `src/audit/` domain: where `DEFAULT_AUDIT_CONFIG` is defined, where path encoding lives, and how the test harness is placed.

## Context

**Business impact:** `DEFAULT_AUDIT_CONFIG` is mandated as the single source of truth for audit path components. Without a decision on its TypeScript location and shape, every consumer independently invents the structure.

**Technical constraints:** The audit domain is self-contained — it does not depend on `src/session/` or `src/validation/`. Path encoding (spec node path → directory name) is a pure function used by both test infrastructure and the production verify pipeline. Timestamp generation for verdict filenames must use UTC components to ensure timezone-independent lexicographic ordering.

## Decision

The audit domain module tree under `src/audit/` has two concerns: config and test infrastructure.

`src/audit/config.ts` exports the audit config constant, the path-encoding function, and the timestamp formatter — the three shared utilities every audit consumer needs.

`DEFAULT_AUDIT_CONFIG` is an `as const` typed constant, independent of `DEFAULT_CONFIG`, with three fields: the `.spx` directory name, the `nodes` subdirectory name, and the `.audit.xml` verdict filename suffix.

`encodeNodePath` is a pure function that converts a spec node path to a filesystem directory name by replacing every `/` with `-`.

`formatAuditTimestamp` generates a `YYYY-MM-DD_HH-mm-ss` string using UTC components and accepts an optional injectable clock for deterministic testing.

`src/audit/testing/harness.ts` exports `AuditHarness` (an interface with `projectRoot`, `nodeDir`, `writeVerdict`, and `cleanup` members) and the `createAuditHarness` factory. All path construction in the harness delegates to `DEFAULT_AUDIT_CONFIG` and `encodeNodePath`.

## Rationale

Keeping audit config independent of `DEFAULT_CONFIG` maintains the audit domain's self-containment. `DEFAULT_CONFIG` covers core spx concerns (specs, sessions); audit artifacts are ephemeral and domain-specific.

Placing `encodeNodePath` in `config.ts` co-locates it with the config it derives from — `DEFAULT_AUDIT_CONFIG.spxDir` and `DEFAULT_AUDIT_CONFIG.nodesSubdir` are the values that give encoding its meaning. The production verify pipeline and the test harness both import from `config.ts`, ensuring consistent encoding.

UTC timestamps are required because verdict files are lexicographically sorted to find the latest audit, and agents run across timezones. Local timestamps would produce non-reproducible orderings when comparing verdicts from different machines.

The injectable clock in `formatAuditTimestamp` enables `l1` tests to verify the exact filename produced by `writeVerdict` without relying on real wall-clock time.

## Trade-offs accepted

| Trade-off                                       | Mitigation / reasoning                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Audit config not merged into `DEFAULT_CONFIG`   | Audit is ephemeral local state; merging would couple the core config schema to domain          |
| `encodeNodePath` in `config.ts` not in `paths/` | Encoding is a direct consequence of the config shape; co-location makes the dependency obvious |

## Invariants

- `encodeNodePath` is a pure function: same input always produces same output, no side effects
- `DEFAULT_AUDIT_CONFIG` is `as const` — never mutated at runtime
- `formatAuditTimestamp` uses `getUTC*` methods — timezone-independent

## Compliance

### Recognized by

`DEFAULT_AUDIT_CONFIG`, `encodeNodePath`, and `formatAuditTimestamp` originate from a single audit-domain module. All audit consumers import from that module — no path-component string literals appear at call sites.

### MUST

- Export `DEFAULT_AUDIT_CONFIG` from `src/audit/config.ts` — single source of truth for audit path components ([review])
- Implement `encodeNodePath` as a pure function with no side effects — enables `l1` property testing ([review])
- Use UTC methods (`getUTCFullYear`, `getUTCMonth`, etc.) in `formatAuditTimestamp` — timezone-independent sorting ([review])
- Accept optional `now?: () => Date` in `formatAuditTimestamp` — injectable clock for deterministic `l1` tests ([review])
- Import `DEFAULT_AUDIT_CONFIG`, `encodeNodePath`, and `formatAuditTimestamp` from `src/audit/config.ts` in all consumers — no duplicate definitions ([review])

### NEVER

- Add audit configuration to `DEFAULT_CONFIG` in `src/config/defaults.ts` — audit is domain-specific ephemeral state ([review])
- Hardcode `.spx`, `nodes`, or `.audit.xml` as string literals outside `DEFAULT_AUDIT_CONFIG` — single source of truth for all audit path components ([review])
- Use `getFullYear`/`getHours` (local time) in `formatAuditTimestamp` — breaks timezone-independent ordering ([review])
