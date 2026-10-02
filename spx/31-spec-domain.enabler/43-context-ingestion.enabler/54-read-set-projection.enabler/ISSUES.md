# Open Issues

## Manifest cases in the show-exclusion compliance file claim behavior no linked assertion declares

`tests/context-manifest.compliance.l1.test.ts` is linked to the issue-reference, show-exclusion, and tree-ordering compliance assertions, which all speak of `show`. Several of its cases exercise `list` instead and claim behavior none of those assertions declares: the read-role group ordering of the manifest, a symbolic-link guide whose canonical target escapes the product, and the read-versus-listed classification of runtime guides and overlays.

**Evidence:** the test-evidence audit of this node at head `a3083cd04` recorded it as `f-003`, rule `misattributed-case`, severity warning.

**Impact:** a defect in manifest role ordering, guide containment, or overlay classification fails this node's compliance result under an assertion that does not describe it.

**Settlement condition:** each `list` behavior those cases exercise is declared by an assertion of the node that owns the manifest, and the cases move to evidence linked from that assertion.
