# Plan: Test Evidence Naming Enforcement

## Purpose

Add a validation rule that prevents spec-tree test evidence filenames from regressing away from the canonical `<subject>.<evidence>.<level>[.<runner>].test.ts` form.

## Rule

Every `spx/**/tests/*.test.ts` filename must match the canonical TypeScript evidence filename shape:

- `subject`: non-empty filename subject
- `evidence`: one of `scenario`, `mapping`, `conformance`, `property`, or `compliance`
- `level`: one of `l1`, `l2`, or `l3`
- `runner`: optional runner token before `.test.ts`

The rule belongs under `spx/41-validation.enabler/` because it is an `spx validation` check.

## Implementation Route

1. Author the owning validation-rule node under `spx/41-validation.enabler/`.
2. Model the implementation on `src/validation/literal/`, including detector, config, registry participation, validation result shape, and CLI registration through `src/interfaces/cli/`.
3. Add a debt allowlist JSON keyed by node directory, mirroring `eslint.test-owned-constant-debt-nodes.json`, for files that still need a rename or split.
4. Re-derive the live allowlist with `git ls-files 'spx/**/tests/*.test.ts'` filtered to filenames that fail the canonical pattern. Trust the live list, not any historical count.
5. Add focused tests against violating fixtures through the owning node.
6. Run `/apply` for the validation-rule node, including spec, test-evidence, architecture, and code audit gates.
7. Wire the rule into `validation all`.

## Cleanup Follow-Up

After the enforcement rule exists, reclassify and remove allowlisted files:

- `.integration` and `.e2e` files become evidence-level names such as `<subject>.scenario.l2.test.ts`, `<subject>.mapping.l2.test.ts`, or `<subject>.compliance.l2.test.ts` according to their assertions.
- Precommit `.unit` files are renamed or split through the precommit rearchitecture owned by `spx/21-infrastructure.enabler/43-precommit.enabler`.

Shrink the allowlist in the same changeset that renames or splits each owning node's files.
