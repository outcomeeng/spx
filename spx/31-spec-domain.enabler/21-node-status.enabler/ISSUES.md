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
