# Open Issues

## "Tracked node specs" claims git tracking that the classification-tree fixture does not establish

**Evidence:** the first property assertion in
[`spx/31-spec-domain.enabler/21-node-status.enabler/32-node-status-test-support.enabler/node-status-test-support.md`](spx/31-spec-domain.enabler/21-node-status.enabler/32-node-status-test-support.enabler/node-status-test-support.md)
states that generated classification-tree fixtures "materialize tracked node
specs". The spec's own opening says the same thing in its `CAN` clause ("real
tracked spec-tree fixtures"). In the parent node-status decisions, "tracked"
means git-tracked.
[`spx/31-spec-domain.enabler/21-node-status.enabler/21-node-status-architecture.adr.md`](spx/31-spec-domain.enabler/21-node-status.enabler/21-node-status-architecture.adr.md)
defines the `--update` write set as node directories where git tracks at least
one file, and it states that outside a git repository the tracked-path query
yields no scoping, so every node directory is written. `withClassificationTree`
in `testing/harnesses/node-status/node-status.ts` materializes the tree through
`withTestEnv` into a temporary product directory and initializes no git
repository. Git initialization and staging belong to the separate
`trackSpecTree` export.
`spx/31-spec-domain.enabler/21-node-status.enabler/32-node-status-test-support.enabler/tests/node-status-test-support.property.l1.test.ts`
neither calls `trackSpecTree` nor observes any git state.

**Impact:** a test-evidence audit reads "tracked" in its decision-record sense
and finds that the linked property test does not fulfill that clause. The
assertion then reads as unfulfilled, even though the rest of the property is
exercised. The fixture also runs `--update` consumers on the no-tracked-set
fallback, not on the git-tracked boundary that the word names. Readers of the
spec can therefore conclude that classification-tree evidence covers tracked
membership when it does not.

**Settlement condition:** one of two outcomes resolves this entry:

- The assertion and the opening are reworded to name the state class the
  fixture actually establishes, which is node specs materialized in the
  worktree-local `spx/` tree of a temporary product directory, without
  claiming git tracking.
- `withClassificationTree` git-tracks the materialized tree, and the linked
  property test observes that every materialized node spec and evidence file
  is git-tracked.
