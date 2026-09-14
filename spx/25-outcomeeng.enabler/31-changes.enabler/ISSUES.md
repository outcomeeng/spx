# Issues: local Change draft prototype

## Deferred prototype evidence refinements

The operator approved deferring the following evidence refinements on 2026-09-08 while the first-use Change workflow is evaluated. The prototype may change or be retired. These gaps remain recorded without expanding this delivery into test-framework maintenance or claiming that the rejected audits approved it.

### Invalid-command cases repeat fixed retained contents

`testing/generators/change-drafts.ts` projects `missingInput` and `missingId` from a generated suffix that neither command uses. `spx/25-outcomeeng.enabler/31-changes.enabler/43-change-cli.enabler/tests/change-cli.property.l1.test.ts` creates the retained draft from `JSON.stringify(command)`, so both the command and retained contents are constant for those two cases. The commands execute and their rejection is checked, but repeated draws add no property evidence for varying retained contents.

If this evidence is retained, compose each invalid-command case with independently generated draft text and keep the preservation predicate in the linked test. Inspect the effective domain of all five invalid-command cases together; avoid another constant-only wrapper. The governing assertion is in `spx/25-outcomeeng.enabler/31-changes.enabler/43-change-cli.enabler/change-cli.md`; `/test` and `typescript:test-typescript` own the repair.

### Descriptor evidence does not distinguish normalized relative paths

`spx/25-outcomeeng.enabler/31-changes.enabler/32-change-drafts.enabler/tests/drafts.property.l1.test.ts` checks that the returned relative path resolves to the absolute path, but a leading `./` would pass that check. The normalized-path clause in `spx/25-outcomeeng.enabler/31-changes.enabler/32-change-drafts.enabler/change-drafts.md` therefore lacks a discriminating predicate. No normalization failure was observed in the implementation.

If this evidence is retained, compare returned relative paths with an independent canonical path operation inside the linked test. Check create and list descriptors together. `/test` and `typescript:test-typescript` own the repair.

### Revisit condition and delivery disposition

Revisit these gaps when the operator retains the Change workflow beyond its prototype trial, or when a subsequent change materially alters the corresponding command or descriptor contract. Reassess the evidence against the then-current behavior before implementing either refinement.

The inspected source and evidence subject is `c9b565f798325fa11b69e76828f2ca00ee3a8465`. Its build, source validation, and 158 focused tests passed. The two evidence audits rejected the gaps above. The operator authorized recording them and continuing this prototype's merge; the deferral does not turn those verdicts into approvals or waive failures in deterministic verification. Shared verification-harness maintenance is tracked separately in `spx/34-verification.enabler/32-verify.enabler/ISSUES.md`.
