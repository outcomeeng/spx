# Open Issues

## The evidence fold admits a runner outcome with no verdict for a listed path and folds it to passed

`EvidenceOutcome` in `src/domains/test/evidence.ts` carries a runner's `pathVerdicts` and does not tie them to the outcome's `testPaths`, so the type admits a runner outcome that lists a test path with no verdict. `buildEvidenceResults` emits one result per recorded verdict only, so a listed path with no verdict yields no result, and `foldEvidenceVerdict` folds the remaining results to `passed` when none fails or is `not-run`. Only the last-run reader (`readPathVerdicts` in `src/test/run-state.ts`, through `validateTestRunState`) excludes that shape, by classifying the whole run as incomplete evidence with `SHAPE_INVALID_STATE`; the fold itself does not.

**Evidence:** `src/domains/test/evidence.ts` (`EvidenceOutcome`, `buildEvidenceResults`, `foldEvidenceVerdict`); `src/commands/spec/node-outcome-resolver.ts` (`createNodeOutcomeResolver` folds the outcomes `readTestingRuns` returns); `src/test/run-state.ts` (`readPathVerdicts`).

**Impact:** a caller that supplies the fold an outcome built outside `readTestingRuns` gets `passed` for a path the runner recorded no verdict for, so absence of a verdict reads as a pass. The only producer today is the reader, which rejects the shape, so the defect is reachable only through a new producer or a change to the reader.

**Settlement condition:** the fold's input type carries one verdict per listed path, or every fold over it treats a listed path with no verdict as `not-run`, shown by evidence that fails when a fold over such an outcome returns `passed`.

## The node-status modules strip the order prefix with a single-dot copy of the index grammar

`src/lib/node-status/link-format.ts` (`ORDERED_DIRECTORY_NAME`), `src/lib/node-status/provider.ts` and `src/lib/node-status/spec-declaration.ts` (`SLUG_OF_DIRECTORY`), and `src/lib/node-status/claim-state.ts` (`ORDER_PREFIX`) each declare their own pattern for a node directory's order prefix, and each admits at most one dot segment. `src/lib/spec-tree/config.ts` declares the index forms the naming-schema versions accept — `DIGIT_RUNS` and `TWO_DIGIT` under `ORDER_FORMS`, both admitting any number of dot segments — and `parseOrderedSlug` in `src/lib/spec-tree/index.ts` strips the prefix through the selected version's `order.PATTERN`.

**Evidence:** for a directory named `20.1.5-foo.enabler`, none of the four patterns matches. `provider.ts` and `spec-declaration.ts` fall back to the whole directory name, so the spec path they build does not exist and the node's declared malleability and audit rule slugs are lost; `link-format.ts` reports the node's prior-form spec as no spec, so the link-format currency exemption does not apply; `claim-state.ts` gives the decision file and the toward-target segment an order of negative infinity, so the governing-decision paths at that depth are empty. No node in the tree carries a multi-dot index. Raised as a DEBT finding by the CI review of PR 679.

**Impact:** a node at a multi-dot index reads with the wrong spec path, the wrong governing decisions, and no link-format exemption, with no diagnostic.

**Settlement condition:** the four sites take the slug and order index from the spec-tree library's per-version order grammar, or from one node-status helper covering the same grammar, and evidence shows a node at a multi-dot index resolves its spec path and governing decisions.

## The status report reader carries no evidence of its own

`readNodeStatusReports` (`src/lib/node-status/report.ts`, exported from `src/lib/node-status/index.ts`) builds the per-node report `spx spec status` renders and embeds under `--format json`: each result's verdict, pin, actor and run, and whether its pin is current. No test under `spx/**/tests/` imports `readNodeStatusReports` or `src/lib/node-status/report.ts`.

**Evidence:** the CI review of PR 679 raised this as a DEBT finding; the test-evidence audit of this node on that branch reported it as a non-blocking warning.

**Impact:** the reporting the status-file contract declares — verdict, pin, actor, run and currency per result, for the version-1 and the 4.0 shape — is reached only through the command layer, so a defect in the reader's currency or shape reporting reaches no failing test in this node.

**Settlement condition:** a test in this node exercises `readNodeStatusReports` over a version-1 claim and a 4.0 claim and asserts the currency it reports per result.

## The read path and the write path resolve a node's spec path through different functions `src/lib/node-status/provider.ts` `specPathOf` `consistency`

`specPathOf` in `src/lib/node-status/provider.ts` resolves a node's governing spec path by membership in the git-tracked path set, choosing the canonical path when tracked and the prior-form path otherwise, with no filesystem read. `readNodeSpecDeclaration` in `src/lib/node-status/spec-declaration.ts` resolves the same path by reading the candidates from disk and taking the readable one. `foldTrackedNodeClaims` in `src/lib/node-status/update.ts` (the write path) computes `governingDeclarationPaths` through `readNodeSpecDeclaration`; `classifyClaim` in `provider.ts` (the read path) ignores the claim's recorded `state`, recomputes it through `classifyNodeClaim`, and computes the same `governingDeclarationPaths` through `specPathOf`.

**Evidence:** for a node whose canonical spec exists on disk and is not yet tracked, `specPathOf` returns the prior-form path, which does not exist, while `readNodeSpecDeclaration` finds the canonical file. The two paths can then disagree on `recordedPassingAtOrAfterDeclaration`. `spec status --update --check` compares two calls of the writer path and never reaches `provider.ts`, so it does not expose the disagreement. The PR body names the pairing among the candidates the blocked implementation audit named but did not record. Raised as a DEBT finding by the CI review of PR 679 on head d598cbdb48b7e9d9276843644a4db1e7aa899d71.

**Impact:** for a newly authored, untracked node, the state `spx spec status` prints after `--update`, or without it, can differ from the state written to that node's `spx.status.json`.

**Settlement condition:** one shared function resolves a node's spec path, `foldTrackedNodeClaims` and `classifyClaim` both consume it, and evidence shows an untracked node with an on-disk canonical spec reads the same state on both paths.

## The node-status modules hand-code the order-prefix and slug pattern outside the versioned grammar assertion:ordinal-25:spx/23-spec-tree.enabler/29-filename-grammar.enabler/filename-grammar.md:constraint-unmet

`src/lib/node-status/provider.ts` (lines 36 and 135), `src/lib/node-status/spec-declaration.ts` (line 15), `src/lib/node-status/link-format.ts` (line 10), and `src/lib/node-status/claim-state.ts` (line 59) each declare the order-prefix and slug pattern of a node directory name, for example `/^\d+(?:\.\d+)?-(.+)\.[a-z]+$/`, and apply it in state derivation. The versioned filename grammar in `spx/23-spec-tree.enabler/29-filename-grammar.enabler/filename-grammar.md` owns that pattern, and the node-status modules do not read it from the grammar's exports.

**Evidence:** the assertion audit run 2026-10-27_18-42-54-635-6e4d085c4e67 of `spx/23-spec-tree.enabler/29-filename-grammar.enabler/filename-grammar.md` reported rule `constraint-unmet`, severity `debt`, for the assertion at ordinal 25 at the five locations above.

**Impact:** each hand-coded pattern changes independently of the versioned grammar, so a grammar change reaches state derivation only where a module is edited to match, and the four sites can disagree with each other and with the grammar.

**Settlement condition:** the node-status modules read the order pattern from the filename-grammar exports of `spx/23-spec-tree.enabler/29-filename-grammar.enabler`, and no module under `src/` declares it again.

## The node-status modules declare grammar token constants outside the registry surface assertion:ordinal-27:spx/23-spec-tree.enabler/29-filename-grammar.enabler/filename-grammar.md:constraint-unmet

`src/lib/node-status/provider.ts` declares `export const VARIANT_DIRECTORY_SUFFIX = ".variant"` at line 33 and uses it at line 89. The constant duplicates `KIND_REGISTRY.variant.suffix`. The four order-pattern regexes at `src/lib/node-status/provider.ts` (lines 36 and 135), `src/lib/node-status/spec-declaration.ts` (line 15), `src/lib/node-status/link-format.ts` (line 10), and `src/lib/node-status/claim-state.ts` (line 59) are further module-local grammar tokens.

**Evidence:** the assertion audit run 2026-10-27_18-42-54-635-6e4d085c4e67 of `spx/23-spec-tree.enabler/29-filename-grammar.enabler/filename-grammar.md` reported rule `constraint-unmet`, severity `debt`, for the assertion at ordinal 27 at these locations.

**Impact:** grammar tokens declared outside the registry surface can drift from the registry's values, so the variant suffix and the order pattern have more than one source of truth.

**Settlement condition:** the node-status modules read the order pattern and the variant suffix from the filename-grammar exports of `spx/23-spec-tree.enabler/29-filename-grammar.enabler`, and no module under `src/` declares them again.
