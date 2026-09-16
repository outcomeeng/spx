# Issues

## Compliance evidence lacks whole-payload violating fixtures

The test-evidence audit of release candidate
`b47377e9835717e1f563fa4ceb06f74b114eb279` returned `REJECTED` with three
`assertion-type-strategy` findings in
`tests/release-notes.compliance.l1.test.ts`:

- `f-001`, line 733: the omitted-commit-type boundary uses generated property
  cases instead of a real violating whole-payload fixture.
- `f-002`, line 64: prompt contents, validation, faithfulness auditing, and
  atomic promotion use generated scenarios and controlled collaborators instead
  of the required violating fixtures.
- `f-003`, line 378: canonical containment and path-swap rejection use generated
  path scenarios rather than the required violating whole-payload fixtures.

**Impact:** execution reaches the asserted production behavior, but the evidence
does not use the Compliance strategy required by the test-evidence standards.
Passing deterministic tests do not resolve this audit rejection.

**Release disposition:** the release candidate changes dated-heading conformance
evidence, its generator, and the version-heading parser. The compliance test file
and the three cited assertion contracts are unchanged. These findings are recorded
as out-of-PR evidence subjects under the merge policy's auditor-verdict rule;
the overall audit verdict remains rejected. Repair spans the compliance suite's
fixture and collaborator design independently of the dated-heading change.

**Settlement condition:** evidence for all three assertions uses whole-payload
violating fixtures through the governed production boundaries, passes the node's
deterministic tests, and receives an approved test-evidence audit. The governing
workflows are `/test`, `/test-typescript`, and `/audit-tests`.
