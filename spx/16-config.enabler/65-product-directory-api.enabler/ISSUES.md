# Open Issues

## The product-context runner re-implements the property harness

**Evidence:** `runProductContextCases` in
`testing/harnesses/product-context/mapping.ts` calls
`fc.check(fc.asyncProperty(...))` directly instead of the `assertProperty` the
property harness exposes. It declares its own run count and its own seed bound —
a duplicate of the harness-private seed modulus — draws its own seed, passes its
own per-run timeout rather than the harness's resolved timeout, and throws a bare
`Error` instead of the harness-owned property-failure shape, so a failure loses
the structured replay the harness establishes. The linked mapping test composes
the whole-run Vitest envelope from the harness's own run-count and timeout tables
at its call site. Finding f-001 of the changes review at run
`2026-09-21_20-08-27-899-a44e4d7658db` records this against the compliance
assertion of `spx/22-test-environment.enabler/32-property-harness.enabler`, which
states that a property test using the harness declares no run count, seed, or
timeout of its own.

**Impact:** the composed envelope carries no margin — three runs at five thousand
milliseconds each against a fifteen-thousand-millisecond envelope, while the
harness's own envelope export adds one — so the `-C` validation case fails on a
loaded host for want of headroom rather than for any defect it asserts. The
compliance test calls the same runner with no envelope at all and relies on the
global timeout while running three times the work of one case.

**Related:** the same class is filed at
`spx/22-test-environment.enabler/32-property-harness.enabler/ISSUES.md` as "The
harness owns the per-run timeout but no whole-run envelope", and at
`spx/25-outcomeeng.enabler/31-methodology-plugin.enabler/ISSUES.md` against
`tests/fetch.property.l1.test.ts`.

**Settlement condition:** the generated cases run through the property harness's
`assertProperty` under a declared classification, so the harness owns the run
count, the seed draw, the per-run timeout, and the failure shape; the local run
count, seed bound, and bare-`Error` path are gone; and the whole-run envelope
comes from a harness-owned export, which the property-harness node supplies where
none exists today.

## Universal root-directory vocabulary assertions cover one resolver

**Evidence:** the node's vocabulary and no-alias assertions quantify over config
APIs, test harnesses, descriptor tests, and root-directory APIs. Their linked
`tests/product-directory-api.compliance.l1.test.ts` exercises only
`resolveProductDir` and its returned object: lines 12 and 15 underpin findings
f-001, f-002, and f-003 from the test-evidence audit at
`e218e4c22e14fbb2a2d833eec6f4b42c775d1f47`.

**Impact:** another root-directory API can expose a legacy root name or a
compatibility alias while these tests pass. The resolver checks establish only
that resolver's vocabulary.

**Settlement condition:** structural evidence checks every exported
root-directory API for the declared vocabulary and absence of compatibility
aliases, with violating cases that prove the check detects each forbidden
shape. Evidence also covers the harness and descriptor-test naming surface the
assertions declare.
