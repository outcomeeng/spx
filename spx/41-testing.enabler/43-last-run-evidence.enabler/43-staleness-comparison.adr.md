# Staleness Comparison Architecture

## Purpose

This decision governs how cached test state is compared against current inputs to detect staleness, with digest-based comparison across config, test files, and product inputs.

## Context

**Business impact:** Fast status reporting needs to determine whether cached test observations are still valid. State becomes stale when: (1) testing config changes, (2) discovered test files change, (3) test file contents change, or (4) descriptor-declared product inputs change. Staleness must be deterministically comparable without re-running tests.

**Technical constraints:** Staleness comparison must check four digests: testing config digest (from canonical descriptor), test path set digest, test content digest, and descriptor-declared product input digests. All four must match the values recorded in the cached state for fast status to trust the observation.

## Decision

Define a `StalenessInputs` interface capturing all staleness inputs (config digest, path digest, content digest, product input digests) and a `isStalenessMatch(recordedInputs, currentInputs)` function that compares them. The function returns `boolean` indicating whether the state is still fresh (all inputs match).

The module exports:

1. `StalenessInputs` interface with all four digest fields
2. `digestTestPaths(paths)` and `digestTestContents(entries)` — pure helpers that derive the path-set and content digests from the primitive inputs the caller supplies (a list of discovered paths, a list of path/content entries)
3. `isStalenessMatch(recorded, current)` - compares recorded and current inputs
4. `extractStalenessInputs(state)` — projects the four recorded staleness fields out of a `TestRunState`

This node does not discover test files or walk the tree — discovery is the parent `spx/41-testing.enabler/testing.md` concern. The caller passes already-discovered paths and contents; this node only digests and compares them.

## Rationale

Digest-based comparison is deterministic and fast (string comparison, no re-running tests). Separating digesting from comparison keeps concerns distinct: `digestTestPaths` and `digestTestContents` are pure over their primitive inputs, `isStalenessMatch` is a pure equality check over the four recorded digests. All four inputs must match to trust the observation; any mismatch invalidates the cache.

The testing config digest comes from the canonical descriptor digest (per `spx/16-config.enabler/54-canonical-descriptor-digest.enabler/canonical-descriptor-digest.md`). Test path and content digests are derived from the discovered paths and contents the caller supplies. Product input digests come from the descriptor system (per `spx/16-config.enabler/43-domain-execution-descriptors.enabler/domain-execution-descriptors.md`).

Alternatives considered:

- **Timestamp-based staleness**: Check if any file is newer than the recorded time. Rejects because it's brittle (file mtimes can be manipulated, it's racey across machines).
- **Partial staleness checks**: Only check config digest, skip content digests. Rejects because it misses real changes (users could edit test files without updating config).
- **Eagerly invalidate cache on any file change**: Delete cached state whenever files change. Rejects because it loses useful observations unnecessarily; digest comparison is more precise.

## Trade-offs accepted

| Trade-off                                      | Mitigation / reasoning                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Four digests must all match to trust state     | Conservative approach; any divergence invalidates the observation. Rejected observations can be refreshed |
| Digest computation adds overhead per command   | Overhead is small (JSON serialization + hashing); enables correct staleness detection                     |
| Product input digests depend on descriptor API | Hard prerequisite per PLAN.md; decision assumes the descriptor API exists and is stable                   |

## Invariants

- All four staleness inputs must be computed for every state freshness check
- State is valid (fresh) only when ALL four digests match recorded values
- Staleness comparison is a pure function (no side effects)
- Digest computation is deterministic (same inputs always produce same digests)

## Compliance

### Recognized by

Observable `StalenessInputs` in state files and staleness comparison function parameters. Stale state is reported with clear indication of which inputs changed.

### MUST

- `digestTestPaths()` and `digestTestContents()` derive their digests deterministically from the caller-supplied paths and contents — this node digests provided inputs, it does not discover them ([review])
- `isStalenessMatch()` returns true only when ALL four recorded digests match current digests — conservative staleness detection ([review])
- Digest computation is deterministic and repeatable — same inputs always produce same digests ([review])
- State is reported as stale immediately if any digest mismatches — fast status doesn't use stale observations ([review])

### NEVER

- Check only subset of staleness inputs (e.g., config digest alone) — misses real changes ([review])
- Use timestamps or file mtimes for staleness comparison — not deterministic across machines or after file re-creation ([review])
- Trust cached state when any recorded digest doesn't match current — even one mismatch invalidates the observation ([review])
