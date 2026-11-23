# Open Issues

## The evidence fold admits a runner outcome with no verdict for a listed path and folds it to passed

`EvidenceOutcome` in `src/domains/test/evidence.ts` carries a runner's `pathVerdicts` and does not tie them to the outcome's `testPaths`, so the type admits a runner outcome that lists a test path with no verdict. `buildEvidenceResults` emits one result per recorded verdict only, so a listed path with no verdict yields no result, and `foldEvidenceVerdict` folds the remaining results to `passed` when none fails or is `not-run`. Only the last-run reader (`readPathVerdicts` in `src/test/run-state.ts`, through `validateTestRunState`) excludes that shape, by classifying the whole run as incomplete evidence with `SHAPE_INVALID_STATE`; the fold itself does not.

**Evidence:** `src/domains/test/evidence.ts` (`EvidenceOutcome`, `buildEvidenceResults`, `foldEvidenceVerdict`); `src/commands/spec/node-outcome-resolver.ts` (`createNodeOutcomeResolver` folds the outcomes `readTestingRuns` returns); `src/test/run-state.ts` (`readPathVerdicts`).

**Impact:** a caller that supplies the fold an outcome built outside `readTestingRuns` gets `passed` for a path the runner recorded no verdict for, so absence of a verdict reads as a pass. The only producer today is the reader, which rejects the shape, so the defect is reachable only through a new producer or a change to the reader.

**Settlement condition:** the fold's input type carries one verdict per listed path, or every fold over it treats a listed path with no verdict as `not-run`, shown by evidence that fails when a fold over such an outcome returns `passed`.

## No evidence shows a node at a multi-dot index resolving its spec path and governing decisions

`src/lib/node-status/provider.ts`, `spec-declaration.ts`, `link-format.ts` and `claim-state.ts` take a node directory's slug and index from `parseSpecTreeNodeDirectoryName` and `parseSpecTreeOrderedName` in `src/lib/spec-tree/index.ts`, which read the order forms of every known naming-schema version, so each accepts any number of dot segments.

**Evidence:** no test of `spx/31-spec-domain.enabler/21-node-status.enabler` builds a node at an index such as `20.1.5`. No node in the tree carries a multi-dot index.

**Impact:** a regression that stops a multi-dot index from resolving passes every node-status test.

**Settlement condition:** evidence shows a node at a multi-dot index resolves its spec path, its governing decisions, and its link-format exemption.

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

## The status-file-contract PDR mixes 3.x and 4.0 form

`15-status-file-contract.pdr.md` keeps its 3.x form: a prose opening with no GOVERNS, SO THAT and CAN RELY ON lines, `## Rationale` and `## Product properties` sections, an untyped `### Testing` group, and tagged rows with no slug. Beside them it holds the 4.0-form `pin-dependency-tree` row and the `### Test.Mapping: lockfile-pin` subsection.

**Evidence:** the file after outcomeeng/changes#1002, whose record writes 4.0-form lines into it. The SPX Advisor's record audit run `2026-11-21_00-07-36-116-6779554d5721` and Review run `2026-11-20_23-59-18-696-cba8dca80590` report the mix against the Audit rule of [spx/13-agent-capability-lifecycle.pdr.md](spx/13-agent-capability-lifecycle.pdr.md).

**Impact:** a reader of the PDR meets two grammars, and the file breaks root PDR 13's rule that an artifact a coding agent changes leaves in the target methodology version's form.

**Settlement condition:** the PDR stands in 4.0 form as a Decision Record with its GOVERNS, SO THAT and CAN RELY ON opening and slugged rules in typed groups.

## The node-status spec mixes 3.x and 4.0 form

`node-status.md` keeps its 3.x name, no front matter and tagged rows, beside the 4.0-form `### Test.Mapping: lockfile-pin` subsection.

**Evidence:** the file after outcomeeng/changes#1002, whose record writes the 4.0-form subsection into it. The SPX Advisor's record audit run `2026-11-21_00-07-36-116-6779554d5721` reports the mix against the Audit rule of [spx/13-agent-capability-lifecycle.pdr.md](spx/13-agent-capability-lifecycle.pdr.md).

**Impact:** a reader of the spec meets two grammars, and the file breaks root PDR 13's rule that an artifact a coding agent changes leaves in the target methodology version's form.

**Settlement condition:** the spec stands in 4.0 form as `node-status.spec.md`, with its front matter and slugged rows.
