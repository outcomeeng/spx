# Open Issues

## No published source relates a plugin version to a methodology version

`spx/13-agent-capability-lifecycle.pdr.md` separates two version axes: the declared
methodology version, which must match the managed instruction markers, and the installed
Spec Tree plugin version, which must merely be *compatible* with it. Its compliance rule
forbids routine capability updates from changing `methodology.version`, so the axes
cannot be the same number.

The marketplace publishes only the plugin axis. `spec-tree@outcomeeng` declares
`version` in its `plugin.json`, and `claude plugin list` reports that value. No manifest
in the plugin states which methodology version that plugin implements. The methodology
axis surfaces in this product only as the managed instruction marker
`<!-- SPEC-TREE v0.30.0 langs:typescript -->`, whose value originates in a
`template_version` field on the plugin's instruction-block template — a field naming that
template rather than the methodology.

**Impact:** the compatibility relation the decision depends on has no published source. A
provenance record can attest the plugin and version it materialized from, because both
are recoverable from the tree, but nothing lets validation decide whether that plugin
version is compatible with the declared methodology version. Until it can, provenance
validation covers digest integrity only.

**Resolution:** obtain the methodology axis from its owner. Either the marketplace
publishes, per plugin version, the methodology version that plugin implements, or the
instruction-block template version is adopted as that statement and named as such. The
question belongs to the Outcome Engineering plugin repository and routes there through
`/issue`; record the answer here, then extend provenance validation to compare the axes.
