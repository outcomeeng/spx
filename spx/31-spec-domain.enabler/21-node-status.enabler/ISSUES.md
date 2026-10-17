# Open Issues

## A covered reference's verdict and read paths are read from different stores with no correlation to one run

`src/commands/spec/node-status-resolvers.ts` takes a covered reference's verdict from `createNodeOutcomeResolver`, which reads the latest recorded last-run evidence, and takes its read paths from a different store: the newest sealed `test` run journal that contains the module, joined to the reference only by module identity (`moduleCovers`). Nothing checks that the journal run is the run that produced the verdict. `unchangedSince` compares only the journal's head commit with the checkout.

**Evidence:** `src/commands/spec/node-status-resolvers.ts` (`resolveReadPaths`, `newestModuleReadPaths`, `unchangedSince`); `src/commands/spec/node-outcome-resolver.ts` (`recordedOutcomes`).

**Impact:** a passed verdict from one run can be pinned to the read set of an earlier or later run, so the pin claims a read set the passing run did not read, and a change to a path the passing run read can go undetected.

**Settlement condition:** the verdict and the read paths of a covered reference are correlated to one recorded run, shown by evidence that a verdict recorded by one run never takes the read paths of a different run, or a decision states that the two stores need no correlation and why.

## The evidence fold admits a runner outcome with no verdict for a listed path and folds it to passed

`EvidenceOutcome` in `src/domains/test/evidence.ts` carries a runner's `pathVerdicts` and does not tie them to the outcome's `testPaths`, so the type admits a runner outcome that lists a test path with no verdict. `buildEvidenceResults` emits one result per recorded verdict only, so a listed path with no verdict yields no result, and `foldEvidenceVerdict` folds the remaining results to `passed` when none fails or is `not-run`. Only the last-run reader (`readPathVerdicts` in `src/test/run-state.ts`, through `validateTestRunState`) excludes that shape, by classifying the whole run as incomplete evidence with `SHAPE_INVALID_STATE`; the fold itself does not.

**Evidence:** `src/domains/test/evidence.ts` (`EvidenceOutcome`, `buildEvidenceResults`, `foldEvidenceVerdict`); `src/commands/spec/node-outcome-resolver.ts` (`createNodeOutcomeResolver` folds the outcomes `readTestingRuns` returns); `src/test/run-state.ts` (`readPathVerdicts`).

**Impact:** a caller that supplies the fold an outcome built outside `readTestingRuns` gets `passed` for a path the runner recorded no verdict for, so absence of a verdict reads as a pass. The only producer today is the reader, which rejects the shape, so the defect is reachable only through a new producer or a change to the reader.

**Settlement condition:** the fold's input type carries one verdict per listed path, or every fold over it treats a listed path with no verdict as `not-run`, shown by evidence that fails when a fold over such an outcome returns `passed`.
