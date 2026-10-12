# Known Issues: 29-filename-grammar.enabler

## Versioned grammar ADR Rationale argues for a removed 2.0.0 version

The Rationale of [`spx/23-spec-tree.enabler/29-filename-grammar.enabler/21-versioned-grammar-model.adr.md`](spx/23-spec-tree.enabler/29-filename-grammar.enabler/21-versioned-grammar-model.adr.md) still argues for a 2.0.0 version that the record no longer declares. Its paragraph on semantic version keys says an era whose node suffixes are canonical but whose spec files carry the bare form "occupies its own version between the node-suffix break and the spec-file break", and concludes: "Two independent breaks landing in sequence therefore produce three versions, and a version sharing node suffixes with a later version exists exactly because its spec-file form differs." The opening and the Invariants declare the versions the record keeps: a first version serving no methodology line, one 3.x version serving the 3.0, 3.1, and 3.2 lines, and a 4.0 version serving the 4.0 line.

**Impact:** The Rationale reasons toward a version the ADR does not declare, so a reader of the record meets a justification that contradicts its own opening.

**Settlement condition:** The Rationale states the versions the ADR declares.
