# Known Issues: 48-skill-conformance-oracle.enabler

## Oracle knowledge-root property defines its domain by the acceptance it asserts `spx/23-spec-tree.enabler/48-skill-conformance-oracle.enabler/skill-conformance-oracle.md` `When the oracle reads the 4.0 naming-schema version, every path beneath a knowledge/ directory it admits maps to valid` `spx/23-spec-tree.enabler/48-skill-conformance-oracle.enabler/skill-conformance-oracle.md:PROPERTY:2`

**Evidence:** the property restricts its domain to paths beneath a `knowledge/` directory the oracle "admits", then asserts that they map to valid, so the domain is defined by the oracle's own acceptance. It names no holder, while the mapping and the decision record admit a `knowledge/` directory both within a node directory and directly under `spx/` for the root product. The parallel property in `spx/23-spec-tree.enabler/29-filename-grammar.enabler/filename-grammar.md` carries the same phrasing and is tracked in that node's `ISSUES.md`.

**Impact:** the assertion text reads as a tautology and leaves the root-product holder unstated, while its test draws the domain from the first path segment under each holder. A reader of the spec alone cannot tell which paths the property ranges over.

**Settlement condition:** the property states its domain as every path whose first segment is `knowledge` and whose later segments are non-empty names, within a node directory or directly under `spx/` for the root product.

## Decision record omits the parent node directory kind from the classifier's inputs [`spx/23-spec-tree.enabler/48-skill-conformance-oracle.enabler/21-conformance-classification.adr.md`](spx/23-spec-tree.enabler/48-skill-conformance-oracle.enabler/21-conformance-classification.adr.md) `Conformance Classification` [`spx/23-spec-tree.enabler/48-skill-conformance-oracle.enabler/21-conformance-classification.adr.md`](spx/23-spec-tree.enabler/48-skill-conformance-oracle.enabler/21-conformance-classification.adr.md)

**Evidence:** the decision record lists the classifier's ancestry context as the parent node directory slug and the location, and its invariants state the knowledge-root and probe-directory paths without a kind condition. The classifier's context carries the parent node directory kind for the node-directory and probe-directory locations, and the probe-lane verdict depends on it: only an output or variant kind admits a probes lane. The spec states that restriction.

**Impact:** a reader of the decision record alone takes the probe-lane verdict to depend on the location and the version set only, and cannot derive the kind the classifier requires.

**Settlement condition:** the decision record states that the ancestry context carries the parent node directory kind, and that a probe directory classifies valid only beneath an output or variant node directory.
