# Issues — Test Environment

## FOLLOW-UP [evidence]: cleanup-failure path of `withTempDir` is unobserved

**Reference:** [`test-environment.md`](test-environment.md) Scenarios — "the callback's result is returned unchanged." [`21-callback-scoped-environment.adr.md`](21-callback-scoped-environment.adr.md) requires callback result return or error rethrow after cleanup without defining cleanup-failure precedence.

**Evidence:** [`testing/harnesses/with-temp-dir.ts`](../../testing/harnesses/with-temp-dir.ts) swallows cleanup failure via `removeTempDir(dir).catch(() => {})` in `withTempDir`'s `finally`. No test in [`tests/temp-dir.scenario.l1.test.ts`](tests/temp-dir.scenario.l1.test.ts) exercises the path where cleanup fails *after a successful callback* to confirm the callback's result still propagates.

**Impact:** Low. The swallow is defensive against an `rm` I/O error on the return path; the creation-side guard (`createTempDir` refusing prefixes that escape `os.tmpdir()`) and the basename prefixes all live callers pass mean the in-`finally` `removeTempDir` guard never throws in practice. The contract "result returned unchanged" is covered for the success-with-clean-cleanup path; only the success-with-failing-cleanup path is unobserved.

**Resolution (deferred):** Closing this cleanly requires a seam the primitive does not expose — simulating an `rm` failure needs either a forbidden filesystem mock (`vi.mock`/`memfs`, barred by the ADR NEVER), a non-portable immutable-flag trick that will not run on Linux CI runners, or an injected-remover parameter that changes the ADR-declared `withTempDir(prefix, callback)` signature. None is worth the cost relative to the impact. Revisit if `withTempDir` ever grows a dependency-injection seam for its remover for another reason.

## Three `[audit]` compliance assertions are statically enforceable

[`test-environment.md`](test-environment.md) Compliance carries three ALWAYS/NEVER rules whose subject is an import or call-site boundary a static rule can decide, so their verification mechanism is `[test]` against violating fixtures rather than `[audit]` judgment:

- "every test harness that needs a temp directory composes on the shared temp-directory primitive ... no harness creates or removes a temp directory directly" — a `mkdtemp` or temp-directory `rm` reference outside [`testing/harnesses/with-temp-dir.ts`](../../testing/harnesses/with-temp-dir.ts).
- "NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism".
- "NEVER: read from the production `src/config/registry.ts`".

The remaining two Compliance rules — that both entrypoints take a caller-supplied `Config` and expose `productDir`, and that neither returns a manual-cleanup handle — assert API shape rather than a decidable source boundary, so `[audit]` is their correct mechanism.

**Impact:** Keeping statically decidable behavior under `[audit]` weakens the spec-test map, and the boundary holds only while a reviewer notices a violation.

**Scope:** The evidence belongs to [`spx/41-validation.enabler/32-typescript-validation.enabler/32-ast-enforcement.enabler`](../41-validation.enabler/32-typescript-validation.enabler/32-ast-enforcement.enabler/ast-enforcement.md), which owns the enforcement rules and their violating-fixture tests. [`spx/13-cli.enabler`](../13-cli.enabler/cli.md) already carries this shape: its "asynchronous `child_process.spawn` imports outside `src/lib/process-lifecycle/`" mapping assertion links evidence in that node.

**Resolution:** author one enforcement rule per boundary in the AST-enforcement node, then retag each of the three assertions `[test]` with a link to the rule's mapping evidence. That node already carries a `vi.mock()` rule, so the mocking boundary needs `jest.mock` and `memfs` added rather than a rule from scratch.

## Sibling generator samplers draw without the seed their contract promises

[`spx/local/typescript-tests.md`](../local/typescript-tests.md) documents `sampleLiteralTestValue` as drawing "one value with a fixed seed so the test is deterministic". Two samplers call `fc.sample(arbitrary, { numRuns: 1 })` with no seed, so each run draws a different case and a failing draw carries no replay path:

- [`testing/generators/literal/literal.ts`](../../testing/generators/literal/literal.ts) `sampleLiteralTestValue`
- [`testing/generators/config/descriptors.ts`](../../testing/generators/config/descriptors.ts) `sampleConfigTestValue`

`sampleTestEnvironmentValue` in [`testing/generators/test-environment/test-environment.ts`](../../testing/generators/test-environment/test-environment.ts) pins its seed and matches the documented contract.

**Impact:** a scenario that fails on an unlucky draw cannot be reproduced, and the overlay describes behavior the two samplers do not have.

**Scope:** [`spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler`](../41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler) owns the literal generator and [`spx/16-config.enabler`](../16-config.enabler/config.md) owns the config descriptors, so neither file belongs to this node.

**Resolution:** pin a seed in both samplers in their owning nodes' changesets, or amend the overlay if unseeded draws are the intended contract.
