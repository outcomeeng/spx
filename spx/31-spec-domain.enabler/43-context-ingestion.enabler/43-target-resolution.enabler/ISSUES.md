# Open Issues

## The accepted-target domain fixes the root decision kind

**Evidence:** `specContextAcceptedTargetCases` in `testing/generators/spec-tree/context-target.ts` builds the root-decision case from `DECISION_KINDS[0]` and draws the node-decision kind through an unseeded sampler, so a run of `tests/context-target-resolution.mapping.l1.test.ts` may exercise one decision kind only while the assertion names both an ADR and a PDR.

**Impact:** the finite decision-kind domain the assertion quantifies over is not enumerated deterministically, so a kind the resolver mishandles can pass unobserved.

**Settlement condition:** the accepted-target domain enumerates every member of `DECISION_KINDS` for the decision classes, and the mapping evidence covers each.
