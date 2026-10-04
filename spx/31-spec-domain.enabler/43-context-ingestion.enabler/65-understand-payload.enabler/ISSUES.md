# Open Issues

## The supports range check reads only the patched form

**Evidence:** `satisfiesMethodologyRange` in `src/lib/methodology/provider-match.ts` parses its operand and every comparator bound through `METHODOLOGY_PATCHED_VERSION_PATTERN`, so a `MAJOR.MINOR` migration source is refused naming the operand's form rather than evaluated and, on a mismatch, named beside the `supports` declaration as [spx/13-agent-capability-lifecycle.pdr.md](spx/13-agent-capability-lifecycle.pdr.md) requires, and a `supports` range written with `MAJOR.MINOR` bounds fails as naming no exact version. `compareVersions` iterates over the left operand's component count, which is why the patched form is required: a two-component operand against a three-component bound would ignore the bound's patch. The shipped `methodology/4.0/source.json` declares no `supports`, so no current match observes it.

**Impact:** once a fetched line records `supports`, a product declaring `methodology.migratingFrom` in the `MAJOR.MINOR` form is refused by `spx spec context show --methodology`, compact recovery, and the diagnose methodology-context check.

**Settlement condition:** the range check evaluates a `MAJOR.MINOR` migration source and `MAJOR.MINOR` bounds against every component they carry and fails naming both declarations, and a linked test under this node exercises a line-form migration source against a patched bound and a patched source against line-form bounds.

## Packaged-executable marker evidence and methodology-fixture draws leave gaps

**Evidence:** `tests/understand-payload.mapping.l2.test.ts` draws `specContextCodingAgentWitnessCases` from `testing/generators/spec-tree/context-target.ts`, which establishes only the first marker key of each coding agent — `CODEX_THREAD_ID` and `CLAUDE_SESSION_ID` — so no packaged-executable case establishes `CLAUDE_ENV_FILE`, although the l2 Mappings assertion states the executable reads all three markers from its invoking environment. The "core escapes the tree by path or by symbolic link" scenario in `tests/understand-payload.scenario.l1.test.ts` composes its traversal-core manifest and its escape body inline, although `writeMethodologyTree` in `testing/harnesses/spec/context.ts` owns the manifest shape and `arbitraryUnsafeTreeSegment` in `testing/generators/methodology/tree.ts` owns traversal segments. `writeMethodologyTree` draws its resource slug through `sampleSpecTreeTestValue`, and `generatedMethodologySource` in `testing/generators/config/descriptors.ts` draws through `sampleConfigTestValue`; both call `fc.sample` without the pinned seed `sampleGeneratedValue` carries.

**Impact:** the executable could stop reading `CLAUDE_ENV_FILE` from its environment while every l2 case passes; a manifest-shape change leaves the inline traversal manifest stale; a failing draw through either unseeded sampler has no replay seed.

**Settlement condition:** the l2 evidence establishes every source-owned marker key through the packaged executable; the traversal-core manifest comes from the tree harness with its traversal segment from the tree generator; `writeMethodologyTree` and `generatedMethodologySource` draw through the seeded sampler.
