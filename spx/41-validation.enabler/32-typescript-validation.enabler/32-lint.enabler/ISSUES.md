# Known Issues: 32-lint.enabler

## Repository lint migration quarantine

`eslint.config.ts` downgrades selected test-only lint rules from error to warning for paths listed in `eslint.test-lint-debt-nodes.json`.

The quarantined rule set is:

- `no-restricted-syntax` entries for assertion string literals and `readFileSync`
- `spx/no-hardcoded-spec-tree-node-kinds`
- `spx/no-hardcoded-spec-tree-node-states`

**Consequence:** `spx validation lint` remains portable for consuming projects, but this repository still carries test-string and registry-literal debt in the manifest paths.

**Remediation:** migrate the manifest-listed tests to import source-owned values or obtain inputs from generators, harnesses, or fixture files. Remove entries from `eslint.test-lint-debt-nodes.json` as each node is migrated; when the manifest is empty, remove the warning override block from `eslint.config.ts`.

## Subprocess result predicates owned by a shared validation harness

`expectValidationSubprocessResult` in `testing/harnesses/validation/cli.ts` holds the `expect` calls over exit codes and output markers, and accepts the expected outcome as its `scenario` input. `testing/harnesses/validation/typescript-pipeline.ts` and `testing/harnesses/validation/pipeline.ts` call it for tests linked from other nodes. The lint tests no longer call it.

**Evidence:** `grep -rn "expectValidationSubprocessResult" testing`.

**Impact:** the tests linked from those other nodes show no predicate to an auditor, and the helper serves only the claim its input encodes.

**Settlement condition:** each calling node's linked tests own the exit-code and output-marker predicates with their expected values, the callers stop passing expected outcomes into the harness, and `expectValidationSubprocessResult` is removed.

## Corrupt-baseline message copied into the lint-policy generator

`JSON_OBJECT_ERROR_FRAGMENT` in `testing/generators/validation/lint-policy.ts` (line 15, exposed as `jsonObjectErrorFragment` at line 36) holds the literal `"must contain a JSON object"`. `parseLintPolicyManifest` in `src/validation/lint-policy-constants.ts` builds that message inline (line 29) and exports no constant for it. The corrupt-baseline case in [lint-policy.compliance.l1.test.ts](tests/lint-policy.compliance.l1.test.ts) asserts against the generator's copy (line 92).

**Evidence:** `grep -rn "must contain a JSON object" src testing`. The audit finding is rule `source-ownership` with remediation target `source-contract`, under `<semantic_binding_ownership>` and [spx/12-test-infrastructure.adr.md](spx/12-test-infrastructure.adr.md): test infrastructure never redeclares production protocol values.

**Impact:** a change to the production message leaves the generator's copy unchanged, so the corrupt-baseline case asserts a value production no longer owns.

**Settlement condition:** production exports the message from its owning module and the generator imports it.
