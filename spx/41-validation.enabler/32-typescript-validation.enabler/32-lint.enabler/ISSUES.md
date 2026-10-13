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

## ESLint argument claims lack a violating fixture

`tests/lint-args.compliance.l1.test.ts` exercises the claims that ESLint receives only the product's flat config, fix mode and caller file scope, and that the flat config comes from language detection, against conforming products and one spawn runner that rejects a wrong executable or argument vector. No fixture presents a product or collaborator that would make `spx` add a repository-specific ignore pattern or warning-budget argument, so the "does not inject" clause has no violating counterpart.

**Evidence:** the argument vectors asserted in `tests/lint-args.compliance.l1.test.ts` all derive from conforming inputs; `observeConsecutiveLintInvocations` is the only case that drives a rejecting double.

**Impact:** the claim holds over the conforming cases only; an injected argument is detected solely through the strict argument-vector comparison.

**Settlement condition:** a violating fixture exists, either a product that carries repository-level lint policy sources the product must ignore or a spawn double that rejects each injected argument class, and the linked test fails when the injection is enabled.
