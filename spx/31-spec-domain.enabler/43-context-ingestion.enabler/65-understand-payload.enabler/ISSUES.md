# Open Issues

## Provider match compares `provides` to the declared version by string equality

**Evidence:** `checkProviderMatch` in `src/lib/methodology/provider-match.ts` rejects a declaration when `plugin.provides !== input.version`. `spx/13-agent-capability-lifecycle.pdr.md` admits both `MAJOR.MINOR` and `MAJOR.MINOR.PATCH` as exact methodology versions and requires the declared version and `methodology.provides` to select the same `MAJOR.MINOR` line, so a product declaring `4.0.0` against a provider declaring `provides: "4.0"` — or the reverse — is a match by the decision and a mismatch by the code. `satisfiesMethodologyRange` parses both operands through the shared `METHODOLOGY_VERSION_PATTERN`, and `compareVersions` iterates over the left operand's component count, so a `MAJOR.MINOR` migration source compared against a `MAJOR.MINOR.PATCH` bound ignores the bound's patch: `satisfiesMethodologyRange("3.2", "=3.2.9")` and `satisfiesMethodologyRange("3.2", ">=3.2.5 <5.0.0")` both return `true`. The shipped `methodology/4.0/source.json` declares no `provides`, so every current match reports `undeclared` and no consumer observes either divergence.

`tests/understand-payload.compliance.l1.test.ts` selects its "recorded provides differs" case by the same string inequality (`candidate.text !== version`), so a same-line patched `provides` is drawn as a mismatch and the line rule, once implemented, breaks that case.

**Impact:** once a fetched line records a `provides` in the other form, `spx spec context show --methodology`, compact recovery, and the diagnose methodology-context check fail a product whose declaration selects the provided line.

**Settlement condition:** `checkProviderMatch` compares the two declarations by their `MAJOR.MINOR` line, the mismatch case draws a `provides` on another line, the `supports` range check evaluates a `MAJOR.MINOR` migration source against every bound component or rejects it with the typed error, and a linked test under this node or the config node exercises a `provides` in each form against a declaration in the other and a line-form migration source against a patched bound.

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
