# Open Issues

## The workflow's pull-request trigger exempts the instruction-document paths the rules name only for pushes

**Evidence:** three rules name the heads CI checks and apply the
instruction-document exclusion to pushes alone, so every pull-request head
targeting the default branch reads as checked:

- product property 3 of
  [`spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md`](spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md);
- the CI-wiring `### Audit` rule of the same decision;
- the CI-wiring `[audit]` Compliance assertion of
  [`spx/31-spec-domain.enabler/21-node-status.enabler/node-status.md`](spx/31-spec-domain.enabler/21-node-status.enabler/node-status.md).

`.github/workflows/deterministic-verification.yml` applies the same
`paths-ignore` anchor (`CLAUDE.md`, `AGENTS.md`, `README.md`, `LICENSE`,
`docs/**`) to its `pull_request` trigger as to its `push` trigger. A pull
request whose changed paths all lie in those paths therefore runs no
verification suite and no status regeneration.

**Impact:** an audit of the CI wiring against the three rules finds a
pull-request head the rules claim and the workflow skips, so the `[audit]`
result cannot pass while the rules and the workflow disagree.

**Settlement condition:** the workflow's `pull_request` trigger drops
`paths-ignore`, or the three rules apply the instruction-document exclusion to
pull-request heads as well as pushes; the rules and the workflow then name the
same heads.
