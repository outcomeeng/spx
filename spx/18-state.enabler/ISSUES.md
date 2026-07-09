# Issues: State

## DEBT — STATE_STORE_DOMAIN may retire entirely once compact and test adopt opaque-token scopes

The verification restructure removed the `audit` and `review` entries from
`STATE_STORE_DOMAIN` (`src/lib/state-store/index.ts`): the journal channel takes
its `<type>` scope segment as a caller-supplied opaque string validated only for
path-safety by `domainDir`, so it needs no enum entry. The enum still enumerates
`compact` and `test` because their consumers — `src/domains/compact/index.ts`
(COMPACT) and `src/test/run-state.ts` (TEST) — still pass a fixed domain
token.

Open question: should `STATE_STORE_DOMAIN` be retired entirely once the COMPACT
and TEST callers also adopt the caller-supplied opaque-token model, or retained
as a compact/test-specific enum? Retiring it spans the compact (`spx/37-compact.enabler`)
and testing (`spx/41-test.enabler`) domains — work outside the verification
restructure — so it is tracked here rather than folded into that changeset.
