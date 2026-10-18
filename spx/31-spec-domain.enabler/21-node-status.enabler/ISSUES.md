# Open Issues

## The evidence fold admits a runner outcome with no verdict for a listed path and folds it to passed

`EvidenceOutcome` in `src/domains/test/evidence.ts` carries a runner's `pathVerdicts` and does not tie them to the outcome's `testPaths`, so the type admits a runner outcome that lists a test path with no verdict. `buildEvidenceResults` emits one result per recorded verdict only, so a listed path with no verdict yields no result, and `foldEvidenceVerdict` folds the remaining results to `passed` when none fails or is `not-run`. Only the last-run reader (`readPathVerdicts` in `src/test/run-state.ts`, through `validateTestRunState`) excludes that shape, by classifying the whole run as incomplete evidence with `SHAPE_INVALID_STATE`; the fold itself does not.

**Evidence:** `src/domains/test/evidence.ts` (`EvidenceOutcome`, `buildEvidenceResults`, `foldEvidenceVerdict`); `src/commands/spec/node-outcome-resolver.ts` (`createNodeOutcomeResolver` folds the outcomes `readTestingRuns` returns); `src/test/run-state.ts` (`readPathVerdicts`).

**Impact:** a caller that supplies the fold an outcome built outside `readTestingRuns` gets `passed` for a path the runner recorded no verdict for, so absence of a verdict reads as a pass. The only producer today is the reader, which rejects the shape, so the defect is reachable only through a new producer or a change to the reader.

**Settlement condition:** the fold's input type carries one verdict per listed path, or every fold over it treats a listed path with no verdict as `not-run`, shown by evidence that fails when a fold over such an outcome returns `passed`.
