# Known Issues: 29-filename-grammar.enabler

## Knowledge-root property defines its domain by the acceptance it asserts `spx/23-spec-tree.enabler/29-filename-grammar.enabler/filename-grammar.md` `For every path beneath a knowledge/ directory the 4.0 naming-schema version accepts` `spx/23-spec-tree.enabler/29-filename-grammar.enabler/filename-grammar.md:PROPERTY:1`

**Evidence:** the property reads "for every path beneath a `knowledge/` directory the 4.0 naming-schema version accepts, that version accepts the path". Read literally, the quantifier ranges over paths the version already accepts, so the domain is defined by the predicate the property asserts. The parallel property in `spx/23-spec-tree.enabler/48-skill-conformance-oracle.enabler/skill-conformance-oracle.md` ("every path beneath a `knowledge/` directory it admits maps to valid") carries the same phrasing.

**Impact:** the assertion text reads as a tautology, while its test draws the domain from the first path segment, so the evidence is not vacuous. A reader of the spec alone cannot tell which paths the property ranges over; a path such as `knowledge//x` lies in neither the text's admitted set nor its excluded set.

**Settlement condition:** each of the two properties states its domain as every path whose first segment is `knowledge` and whose later segments are non-empty names.
