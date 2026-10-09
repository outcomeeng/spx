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

## The status-file contract names no outcome for a stale covered reference without a committed outcome

**Evidence:** three decisions state the stale-evidence fold rule, and none of
them names the outcome for a reference that a recorded run covers, whose
evidence is stale, and for which no committed outcome exists. This happens for
a newly linked reference, or for a node with no `spx.status.json`. In that case
each rule has nothing to keep.

- [`spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md`](spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md):
  product property 2 states that "`--update` folds the outcomes a recorded
  verification run produced: a reference a run covers keeps its committed
  outcome when that evidence is stale, and a reference no run covers is
  `not-run`." The `### Audit` rule "ALWAYS: keep the committed outcome of an
  evidence reference a recorded run covers whose evidence is stale" carries the
  same rule. A PDR audit at head `1b37e9b10ab640be68d3bad51a54dd95bac0e8ec`
  reported the case as an `unstable-property` finding against property 2.
- [`spx/31-spec-domain.enabler/21-node-status.enabler/21-node-status-architecture.adr.md`](spx/31-spec-domain.enabler/21-node-status.enabler/21-node-status-architecture.adr.md):
  the decision text carries "only a covered-but-stale reference is carried
  forward from the node's committed `spx.status.json`"; the "Fold
  preservation" invariant states that a reference whose recorded evidence is
  stale "retains the outcome the node's committed status file records"; and the
  `### Audit` rule states that "an evidence reference the resolver leaves
  unresolved keeps its committed outcome".
- [`spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`](spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md):
  the decision text states that a covered reference "keeps the outcome already
  committed for it when the evidence is stale"; the resolver invariant states
  that a covered reference "keeps its committed outcome when stale"; and the
  `### Audit` rule states that "`--update` keeps the committed outcome of a
  reference a recorded run covers whose evidence is stale".

**Impact:** none of the three decisions fixes the value `--update` writes for
that reference, the value the injected resolver reports for it, or the value CI
regeneration reproduces for it. As a result, no audit can judge the projection
the implementation produces in that case against the contract or against
either architecture decision.

**Settlement condition:** product property 2 and the stale-evidence `### Audit`
rule of
[`spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md`](spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md)
name the outcome for a covered reference with stale evidence and no committed
outcome; the decision text, the "Fold preservation" invariant, and the fold
`### Audit` rule of
[`spx/31-spec-domain.enabler/21-node-status.enabler/21-node-status-architecture.adr.md`](spx/31-spec-domain.enabler/21-node-status.enabler/21-node-status-architecture.adr.md),
and the decision text, the resolver invariant, and the stale-evidence
`### Audit` rule of
[`spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`](spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md),
name the same outcome for that reference.
