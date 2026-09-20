# Open Issues

## The supports range check reads only the patched form

**Evidence:** `satisfiesMethodologyRange` in `src/lib/methodology/provider-match.ts` parses its operand and every comparator bound through `METHODOLOGY_PATCHED_VERSION_PATTERN`, so a `MAJOR.MINOR` migration source is refused naming the operand's form rather than evaluated and, on a mismatch, named beside the `supports` declaration as `spx/13-agent-capability-lifecycle.pdr.md` requires, and a `supports` range written with `MAJOR.MINOR` bounds fails as naming no exact version. `compareVersions` iterates over the left operand's component count, which is why the patched form is required: a two-component operand against a three-component bound would ignore the bound's patch. The shipped `methodology/4.0/source.json` declares no `supports`, so no current match observes it.

**Impact:** once a fetched line records `supports`, a product declaring `methodology.migratingFrom` in the `MAJOR.MINOR` form is refused by `spx spec context show --methodology`, compact recovery, and the diagnose methodology-context check.

**Settlement condition:** the range check evaluates a `MAJOR.MINOR` migration source and `MAJOR.MINOR` bounds against every component they carry and fails naming both declarations, and a linked test under this node exercises a line-form migration source against a patched bound and a patched source against line-form bounds.

## The linked tests pin production where the spec leads it

**Evidence:** `tests/understand-payload.scenario.l1.test.ts` asserts the methodology document is the last read entry (`manifest.read.at(-1)`) while the spec says the core body is emitted first; every path predicate compares the entry path to the plugin-relative core value while the spec says the path is the bundle address followed by the core value; `tests/understand-payload.mapping.l1.test.ts` and the scenario file require every reference, template, and example to be present as a listed catalog entry while the spec and `21-methodology-source.adr.md` say they remain absent from `show`. Production matches the tests in each case (`src/commands/spec/context.ts` appends the core last, emits `manifest.core` as the path, and lists the catalog). The node declares `malleability: spec`.

**Impact:** the three declarations are unfulfilled while their reachability evidence stays green, so the gap is invisible to the deterministic gate.

**Settlement condition:** production emits the core first, frames the path as bundle address plus core value, and omits the catalog from `show`; the tests assert those behaviors against the spec.

## Coding-agent selection evidence enumerates marker subsets by hand

**Evidence:** `tests/understand-payload.mapping.l1.test.ts` and `tests/understand-payload.mapping.l2.test.ts` each hand-write a row table over the three `HOOK_SESSION_START_ENV` marker keys, covering five and four of the eight subsets, with hand-typed expected agents; the traversal-core and absent-catalog manifests, and the escape body, are composed inline in test bodies although `arbitraryUnsafeTreeSegment` and the tree harness own those shapes. `writeMethodologyTree` and `generatedMethodologySource` draw through unseeded samplers, and the "ships no tree for the declared line" scenario returns without a predicate when its draw lands on the fixture line.

**Impact:** three marker subsets are unverified at both levels; a failing fixture draw has no replay seed; one scenario can pass vacuously.

**Settlement condition:** a generator over the source-owned marker keys yields the complete subset domain with the precedence law as its expectation, shared by both levels; violating manifests come from the tree generator; the fixture draws move to the seeded sampler; the declared version is drawn filtered against the fixture line.

## Two declarations carry no production seam

**Evidence:** no `--loaded-methodology` option and no loaded-methodology state exist under `src/`, and no test exercises the mutual exclusion with `--methodology` or the no-persistence claim.

**Impact:** the two assertions are Declared only.

**Settlement condition:** the option exists with the declared exclusion and a test proves no state is persisted across invocations.
