# Issues: 21-node-status.enabler

## Open: ADR Compliance section omits two public exports

`21-node-status-architecture.adr.md` lists the public surface as the classifier,
reader, evidence-provider factory, and `spx spec status --update` orchestration.
The actual `src/lib/node-status/index.ts` surface also exports
`serializeNodeStatus` and the `NodeClassificationFacts` type. The ADR's
`Recognized by` and `MUST` clauses name `classifyNodeStatus` but not these two,
so the compliance description is narrower than the real surface.

**Impact:** Documentation-only. The exports are intentional and covered by tests;
the gap is between the ADR's prose and the barrel.

**Resolution:** Amend the ADR `Compliance > Recognized by` (and the public-surface
MUST) to name `serializeNodeStatus` and `NodeClassificationFacts` alongside
`classifyNodeStatus`, so the description matches `index.ts`.

**Skills:** `spec-tree:authoring` (ADR edit).

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
