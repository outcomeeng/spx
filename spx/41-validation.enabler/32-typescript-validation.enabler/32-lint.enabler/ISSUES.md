# Known Issues: 32-lint.enabler

## Repository lint migration quarantine

`eslint.config.ts` downgrades selected test-only lint rules from error to warning for paths listed in `eslint.test-lint-debt-nodes.json`.

The quarantined rule set is:

- `no-restricted-syntax` entries for assertion string literals and `readFileSync`
- `spx/no-hardcoded-spec-tree-node-kinds`
- `spx/no-hardcoded-spec-tree-node-states`

**Consequence:** `spx validation lint` remains portable for consuming projects, but this repository still carries test-string and registry-literal debt in the manifest paths.

**Remediation:** migrate the manifest-listed tests to import source-owned values or obtain inputs from generators, harnesses, or fixture files. Remove entries from `eslint.test-lint-debt-nodes.json` as each node is migrated; when the manifest is empty, remove the warning override block from `eslint.config.ts`.

## Lint policy assertions delegate to a harness

`testing/harnesses/validation/lint-policy.ts` holds `expect` calls over the lint-policy results (`result.ok`, `result.error`, command exit codes, git state) in the scenario functions that `tests/lint-policy.compliance.l1.test.ts` calls through `lint-policy-compliance`; `lint-args-compliance.ts` and `lint-pipeline.ts` hold their tests' predicates the same way. `tests/superseded-suffix.compliance.l1.test.ts` and `tests/no-spec-tree.compliance.l1.test.ts` own their predicates and call only the observation helper `observeLintPolicyOfProduct`.

**Evidence:** `grep -n "expect(" testing/harnesses/validation/lint-policy.ts testing/harnesses/validation/lint-args-compliance.ts testing/harnesses/validation/lint-pipeline.ts`.

**Impact:** a harness that owns the predicate can serve only the claim it asserts, and the linked test file shows no predicate to an auditor.

**Settlement condition:** each lint assertion's `expect` calls sit in its linked test, with the harness functions returning observations.
