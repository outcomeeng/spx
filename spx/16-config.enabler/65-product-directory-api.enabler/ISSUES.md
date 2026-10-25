# Open Issues

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

## Mapping assertions rest on one generated draw per command `spx/16-config.enabler/65-product-directory-api.enabler/tests/product-context.mapping.l1.test.ts` · `single-draw mapping cases` · `evidence`

**Evidence:** the node's mapping assertions for `config show`, `validation
typescript`, `session list`, and the absent `-C` fallback link
`tests/product-context.mapping.l1.test.ts`. Only the `config show --json` case
keeps a generated property sweep through the injected resolver. The `session
list`, absent `-C` fallback, and `validation typescript` cases each run one
fixed-seed draw from `sampleGeneratedValue(arbitraryProductContextCase())`, and
each also spawns real Git. The CI review of pull request 701 at head
`6d9c8286133db3ac206b374afae20bc19dad28c4` raised this finding.

**Impact:** three of four universal mapping assertions are backed by a single
generated case, so a resolution defect that a different generated input would
expose passes unnoticed for those commands.

**Settlement condition:** the session store resolution consumes the injected
product context, or the session node's own evidence sweeps the `-C`
equivalence.
