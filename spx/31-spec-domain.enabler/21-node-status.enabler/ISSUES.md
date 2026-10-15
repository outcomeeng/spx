# Open Issues

## The tracked-path predicate property never draws a segment-prefix probe

**Evidence:** the property assertion in
[`spx/31-spec-domain.enabler/21-node-status.enabler/21-node-status-architecture.adr.md`](spx/31-spec-domain.enabler/21-node-status.enabler/21-node-status-architecture.adr.md)
states that the tracked-path predicate admits a path exactly when the path is a
git-tracked file or an ancestor directory of one. Its linked evidence,
`spx/31-spec-domain.enabler/21-node-status.enabler/tests/tracked-path-inclusion.property.l1.test.ts`,
draws every probe and every tracked file from `arbitraryTrackedFile` in
`testing/generators/node-status/node-status.ts`. That generator joins whole
segments drawn from `NODE_STATUS_READABLE_SLUGS` (`alpha`, `bravo`, `charlie`,
`delta`, `echo`, `foxtrot`). No slug in that set is a string prefix of another,
so the domain never yields a probe whose last segment is a proper prefix of a
tracked segment, such as the probe `alpha` against the tracked file
`alphabet/x`.

**Impact:** a predicate that admits a path whenever some tracked file starts
with it, dropping the directory-separator boundary, passes every generated case.
The ancestor-directory clause separates a directory from a string prefix, and
that bug class survives the property the clause exists to catch.

**Settlement condition:** the generated domain includes probes whose last
segment is a proper string prefix of a tracked file's segment at the same
depth, and the linked property fails under a predicate that admits string
prefixes without the directory-separator boundary.

## The CI-wiring rules exempt only pushes from the instruction-document paths

**Evidence:** three rules name the heads CI checks, and each applies the
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
verification suite and no status regeneration. The local changes review and
the CI review of pull request #640 each reported this as a `DEBT` finding.

**Impact:** an audit of the CI wiring against the three rules finds a
pull-request head the rules claim and the workflow skips, so the `[audit]`
result cannot pass while the rules and the workflow disagree.

**Settlement condition:** the three rules apply the instruction-document
exclusion to pull-request heads as well as pushes, or the workflow's
`pull_request` trigger drops `paths-ignore`; the rules and the workflow then
name the same heads.
