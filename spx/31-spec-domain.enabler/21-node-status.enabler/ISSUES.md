# Issues: 21-node-status.enabler

## Open: node-slug arbitrary naming and hyphen legibility

`testing/generators/node-status/node-status.ts` builds `SLUG_PATTERN` from
`SLUG_MIN_LENGTH`/`SLUG_MAX_LENGTH` applied to the suffix quantifier, so
`SLUG_MIN_LENGTH = 3` yields an effective minimum total length of 3 — correct,
but the constant name reads as a total-string minimum and a reader must add the
leading character mentally. The pattern also admits consecutive hyphens
(`a--b`), valid but less legible in fast-check counterexamples than the
spec-tree harness's fixed readable `SLUG_POOL` tokens.

**Impact:** Test-infrastructure legibility only; no correctness or behavior
effect.

**Resolution:** Either rename the constants to name the suffix length explicitly,
or switch the slug arbitrary to a fixed readable pool / hyphen-free pattern
matching the spec-tree generator convention.

**Skills:** `typescript:testing-typescript` (generator edit).

## Open: forward-contract test links for the status-to-testing delegation

`node-status.md` carries `[test]` links on the stale/failing/absent-evidence
delegation scenario (`tests/node-status.scenario.l1.test.ts`) and the
delegation compliance rule (`tests/node-status.compliance.l1.test.ts`) whose
covering cases are not yet authored — they are forward contracts. The
delegation is `l1`-verifiable through the dependency-injected node-outcome
resolver mandated by
`spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`;
the covering cases are authored in the implementation unit that wires
`spx spec status --update` to the resolver.

**Skills:** `spec-tree:applying` (implementation), `typescript:testing-typescript` (tests).

## Open: duplicated EXCLUDE membership helper

The review on
[`outcomeeng/spx#266`](https://github.com/outcomeeng/spx/pull/266#issuecomment-4786938639)
identified that `src/lib/node-status/provider.ts` and
`src/lib/node-status/update.ts` each define an `isNodeExcluded` helper with the
same body. The helpers operate on different spec-tree node entry types, but both
types expose the same `ref?.path` shape used for EXCLUDE membership.

**Impact:** Future changes to EXCLUDE matching semantics would need coordinated
edits in both read-back and update paths.

**Resolution:** Extract a shared helper inside the node-status library when
changing EXCLUDE handling or the node-status provider/update boundary.

**Skills:** `spec-tree:apply`, `typescript:code-typescript`,
`typescript:test-typescript`, `typescript:audit-typescript-tests`, and
`typescript:audit-typescript`.
