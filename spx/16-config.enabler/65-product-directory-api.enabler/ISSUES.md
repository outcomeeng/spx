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
