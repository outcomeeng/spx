# Staleness Comparison Architecture

Cached test state is compared against current inputs by digest equality, not timestamps: a `StalenessInputs` value captures the staleness digests and `isStalenessMatch(recorded, current)` returns true only when every digest matches. This node digests and compares already-discovered inputs — it neither discovers test files nor walks the tree, which is the parent `spx/41-testing.enabler/testing.md` concern. The four staleness inputs are the testing config digest (from the canonical descriptor digest per `spx/16-config.enabler/54-canonical-descriptor-digest.enabler/canonical-descriptor-digest.md`), the test path-set digest, the test content digest, and the product input digests derived from product-root paths declared by the testing language descriptors. The module exports the `StalenessInputs` interface carrying all four fields; `digestTestPaths(paths)` and `digestTestContents(entries)`, pure helpers deriving the path-set and content digests from the caller-supplied primitive inputs (a list of discovered paths, a list of path/content entries); `isStalenessMatch(recorded, current)`, comparing recorded and current inputs; and `extractStalenessInputs(state)`, projecting the four recorded staleness fields out of a `TestRunState`.

## Rationale

Digest-based comparison is deterministic and fast — string comparison over recorded hashes, no re-running tests. Separating digesting from comparison keeps concerns distinct: the digest helpers are pure over their primitive inputs, and the match check is a pure equality over the recorded digests. All four inputs must match to trust the observation, and any single mismatch invalidates the cache; a conservative all-must-match rule keeps fast status from ever using a stale observation, and a rejected observation can always be refreshed by a fresh run.

Timestamp-based staleness was rejected because file mtimes can be manipulated and race across machines; partial staleness checks (config digest alone, skipping content digests) were rejected because a user can edit test files without touching config, so a partial check misses real changes; eagerly invalidating the cache on any file change was rejected because it loses useful observations unnecessarily where digest comparison is more precise.

## Invariants

- All four staleness inputs are computed for every state freshness check.
- State is fresh only when all four digests match the recorded values.
- Staleness comparison is a pure function with no side effects.
- Digest computation is deterministic — the same inputs always produce the same digests.

## Verification

### Audit

- ALWAYS: `digestTestPaths()` and `digestTestContents()` derive their digests deterministically from the caller-supplied paths and contents — this node digests provided inputs, it does not discover them ([audit])
- ALWAYS: `isStalenessMatch()` returns true only when ALL four recorded digests match current digests — conservative staleness detection ([audit])
- ALWAYS: digest computation is deterministic and repeatable — same inputs always produce same digests ([audit])
- ALWAYS: state is reported as stale immediately if any digest mismatches — fast status doesn't use stale observations ([audit])
- NEVER: check only a subset of staleness inputs (e.g., config digest alone) — misses real changes ([audit])
- NEVER: use timestamps or file mtimes for staleness comparison — not deterministic across machines or after file re-creation ([audit])
- NEVER: trust cached state when any recorded digest doesn't match current — even one mismatch invalidates the observation ([audit])
