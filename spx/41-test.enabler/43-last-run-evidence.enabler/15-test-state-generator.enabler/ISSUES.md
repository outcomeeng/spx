# Issues: Test-Run-State Generator

## Property tests call fast-check directly, bypassing the property harness's seed and replay

`tests/test-state-generator.property.l1.test.ts` runs each of its two properties through `fc.assert(fc.property(...))` with fast-check's default run count, not through the property harness in `testing/harnesses/property/property.ts`. That harness owns the run count, the per-run timeout, and the seed: it reads `SPX_PROPERTY_SEED` or draws one, and a failure reports the seed and the shrunk counterexample so the caller replays the exact run. A failing property in this file reports fast-check's own seed text and ignores `SPX_PROPERTY_SEED`.

**Impact:** a failure in either property does not replay through the pinned seed every other property in the product uses, and the run count and timeout are fast-check defaults, so the properties' budgets drift from the harness's.

**Scope:** the two properties in the file, "draws every generated status from the source-owned status set" and "produces non-empty, disjoint test-path pairs"; this changeset leaves their `fc.assert` calls unchanged.

**Settlement condition:** both properties run through the property harness, and this node's tests and its test-evidence audit pass.
