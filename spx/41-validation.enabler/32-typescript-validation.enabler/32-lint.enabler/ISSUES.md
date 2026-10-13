# Known Issues: 32-lint.enabler

## Repository lint migration quarantine

`eslint.config.ts` downgrades selected test-only lint rules from error to warning for paths listed in `eslint.test-lint-debt-nodes.json`.

The quarantined rule set is:

- `no-restricted-syntax` entries for assertion string literals and `readFileSync`
- `spx/no-hardcoded-spec-tree-node-kinds`
- `spx/no-hardcoded-spec-tree-node-states`

**Consequence:** `spx validation lint` remains portable for consuming projects, but this repository still carries test-string and registry-literal debt in the manifest paths.

**Remediation:** migrate the manifest-listed tests to import source-owned values or obtain inputs from generators, harnesses, or fixture files. Remove entries from `eslint.test-lint-debt-nodes.json` as each node is migrated; when the manifest is empty, remove the warning override block from `eslint.config.ts`.

## Lint policy assertions delegate to a harness and hand-pick two suffixes

`testing/harnesses/validation/lint-policy.ts` holds `expect` calls over the lint-policy results (`result.ok`, `result.error`, command exit codes, git state) beside the observation helpers `tests/no-spec-tree.compliance.l1.test.ts` and `tests/superseded-suffix.compliance.l1.test.ts` call. Those two tests present `.capability` under 3.2 and 4.0 and `.enabler` under 3.2 only; the assertion states a rule over every suffix and both declarations, and no case presents `.enabler` or a 3.x-only suffix under 4.0, an output-kind suffix under 3.2, or the nested `.product` suffix.

**Evidence:** `grep -n "expect(" testing/harnesses/validation/lint-policy.ts`; the three `it` blocks of `tests/superseded-suffix.compliance.l1.test.ts` take their suffixes from `KIND_REGISTRY.capability` and `KIND_REGISTRY.enabler`.

**Impact:** a lint policy that accepts or rejects the wrong suffix set for either declaration passes unless it is one of the two presented.

**Settlement condition:** the case list pairs each methodology line with every suffix the known naming-schema versions accept or leave behind, with expectations from the independent ordering oracle `semverOrderOracle`, and the `expect` calls over lint-policy results sit in the linked tests.
