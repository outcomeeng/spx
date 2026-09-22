# Open Issues

## The supports range check reads only the patched form

**Evidence:** `satisfiesMethodologyRange` in `src/lib/methodology/provider-match.ts` parses its operand and every comparator bound through `METHODOLOGY_PATCHED_VERSION_PATTERN`, so a `MAJOR.MINOR` migration source is refused naming the operand's form rather than evaluated and, on a mismatch, named beside the `supports` declaration as `spx/13-agent-capability-lifecycle.pdr.md` requires, and a `supports` range written with `MAJOR.MINOR` bounds fails as naming no exact version. `compareVersions` iterates over the left operand's component count, which is why the patched form is required: a two-component operand against a three-component bound would ignore the bound's patch. The shipped `methodology/4.0/source.json` declares no `supports`, so no current match observes it.

**Impact:** once a fetched line records `supports`, a product declaring `methodology.migratingFrom` in the `MAJOR.MINOR` form is refused by `spx spec context show --methodology`, compact recovery, and the diagnose methodology-context check.

**Settlement condition:** the range check evaluates a `MAJOR.MINOR` migration source and `MAJOR.MINOR` bounds against every component they carry and fails naming both declarations, and a linked test under this node exercises a line-form migration source against a patched bound and a patched source against line-form bounds.

## Methodology tree fixture draws carry no replay seed

**Evidence:** `writeMethodologyTree` and `generatedMethodologySource` in `testing/harnesses/spec/context.ts` and `testing/generators/config/descriptors.ts` draw their slugs and source through unseeded samplers, so a failing draw in the tests linked from this node reports no seed.

**Impact:** a failure that depends on the drawn slug or source cannot be replayed from its report.

**Settlement condition:** the fixture draws move to the seeded sampler so a failing draw carries its replay seed.

## The absence clause holds because the source record was never written

The Compliance assertion `The manifest, source record, reference catalog, templates, and examples remain absent from show` is exercised in one place, and that case runs over a methodology tree written without a `source.json`. The absence it observes follows from the file not existing rather than from `show` suppressing it. Every case that does write a source record asserts only the first entry, and both l2 cases read only the first entry of the parsed stream.

**Evidence:** the test-evidence audit of this node at `e372f08c66ebaa9afbf1363be34378fa01ad512f` returned `REJECTED` with finding `f-001`, coverage judgment `missing`, against `tests/understand-payload.compliance.l1.test.ts:179`. `methodologyDocument` in `src/commands/spec/context-show.ts` emits exactly one entry, and `readSourceRecord` reads the record the assertion claims is suppressed.

**Impact:** a projection that emitted the source record as a second entry would satisfy every linked test while the assertion is unfulfilled.

**Settlement condition:** the linked evidence asserts the absence of the manifest, source record, catalog, templates, and examples over a complete entry stream projected from a tree that carries each of them.
