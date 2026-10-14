# Open Issues

## No test evidence covers mixed node evidence

The node spec states four single-status rows: missing evidence maps to `declared`, linked evidence to `specified`, failing evidence to `failing`, and passing evidence to `passing`. It states no rule for a node that carries several evidence entries with different statuses. The mapping test covers the four stated rows only, so the state a node derives from mixed evidence has no test evidence.

**Evidence:** `spx/23-spec-tree.enabler/76-node-state-derivation.enabler/node-state-derivation.md` declares one mapping assertion over single-status rows. `deriveState` in `src/lib/spec-tree/index.ts` resolves multi-entry evidence by a precedence the spec does not state.

**Impact:** A change to the combination of mixed evidence statuses leaves every test passing, and an expected state written from the current derivation would be a second implementation of it rather than an oracle.

**Resolution:** The node spec states the combination rule, and its mapping covers every subset of the evidence statuses.
