# Known Issues: 32-spec-tree-source.enabler

## The equivalence property reads only the 3.2 form

The property that filesystem-shaped and in-memory source records project to equivalent entries materializes its generated tree through `materializeSpecTreeFixture` in `testing/harnesses/spec-tree/spec-tree.ts`, which writes `.product.md`, `.md` spec files, and node directories whose kinds come from the registry's node category. The mapping test presents the 4.0 form through `writeSourceFormTree` in `testing/harnesses/spec-tree/spec-tree-source.ts`; the property does not.

**Evidence:** `tests/spec-tree-source.property.l1.test.ts` runs under `MINIMAL_SPEC_TREE_CONFIG`, a 3.2 declaration, and calls `env.materialize()`; `representativeFixture` draws node kinds from the registry's node category only.

**Impact:** a defect that makes the filesystem source emit a wrong id, ref, parent, or evidence link for a 4.0-form tree (output-kind directories, `.spec.md` specs, a root spec declaring its kind in front matter) passes the property; only the finite mapping cases would catch it.

**Settlement condition:** the representative fixture generator draws node kinds from the target naming-schema version of a methodology line drawn from 3.2 and 4.0, the shared materializer writes the form that line names, and the property runs under that line.
