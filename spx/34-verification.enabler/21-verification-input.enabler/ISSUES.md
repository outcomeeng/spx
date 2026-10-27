# Issues: Verification input

## Two realizations of the verification path scope exist: `src/lib/verification-input/resolve-operand.ts`, `the candidate classification of resolveOperand`, `consistency`

[`spx/29-verification-path-scope.pdr.md`](spx/29-verification-path-scope.pdr.md) governs how product commands resolve caller-supplied product paths. Its first product property collects candidates from the effective invocation directory, and its second normalizes candidates lexically, resolves them through symbolic links, and discards a candidate whose resolved location lies outside the resolved product root. Its audited rule rejects a path operand that escapes the resolved product root through lexical traversal or symbolic-link resolution. [`spx/41-test.enabler/90-targeted-execution.enabler/targeted-execution.md`](spx/41-test.enabler/90-targeted-execution.enabler/targeted-execution.md) cites the same decision and asserts that operand selection is one pure library under `src/lib/test-targeting/`, consumed by every verification surface that narrows work by product path.

`resolveOperand` in `src/lib/verification-input/resolve-operand.ts` realizes the candidate collection and the containment check itself and does not consume `src/lib/test-targeting/index.ts`. The two realizations disagree on the decision's own inputs:

- **Symbolic-link containment.** `resolveOperand` resolves the real path and rejects an escape as `OUTSIDE_ROOT_SYMLINK`. `canonicalizeOperand` in `src/lib/test-targeting/index.ts`, consumed by the path operands of `spx test` and `spx verification run`, checks containment only through the lexical `isPathContained` in `src/lib/file-system/pathContainment.ts`, which calls no real-path resolution. A path that lies lexically inside the product root and links to a target outside it is accepted by those two commands and rejected by `spx verification input inspect`.
- **Candidate sources.** `resolveOperand` collects a candidate from the effective invocation directory when it differs from the product root. `canonicalizeOperand` resolves only against the product directory and has no invocation-directory candidate, so an operand spelled relative to the caller's working directory resolves under `spx verification input inspect` and not under `spx test` or `spx verification run` when the two directories differ.

**Impact:** the product-wide path-operand contract of the decision named above is satisfied by two commands with incompatible symbolic-link and invocation-directory behavior. The same operand is accepted by one verification surface and refused or resolved differently by another, and the symbolic-link escape the audited rule forbids is accepted by `spx test` and `spx verification run`.

**Scope:** the candidate collection and containment of `resolveOperand` in `src/lib/verification-input/resolve-operand.ts`, `canonicalizeOperand` in `src/lib/test-targeting/index.ts`, and `isPathContained` in `src/lib/file-system/pathContainment.ts`. `resolveOperand` follows the decision; the lexical, product-root-only `canonicalizeOperand` diverges from it.

**Settlement condition:** one realization of the decision's candidate collection and containment exists, and every path-taking verification surface consumes it.

**Evidence:** `src/lib/verification-input/resolve-operand.ts` lines 70-117; `src/lib/test-targeting/index.ts` `canonicalizeOperand`; `src/lib/file-system/pathContainment.ts` lines 25-34; the CI review of pull request outcomeeng/spx#710.
