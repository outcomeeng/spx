# Open Issues

## A covered reference's verdict and read paths are read from different stores with no correlation to one run

`src/commands/spec/node-status-resolvers.ts` takes a covered reference's verdict from `createNodeOutcomeResolver`, which reads the latest recorded last-run evidence, and takes its read paths from a different store: the newest sealed `test` run journal that contains the module, joined to the reference only by module identity (`moduleCovers`). Nothing checks that the journal run is the run that produced the verdict. `unchangedSince` compares only the journal's head commit with the checkout.

**Evidence:** `src/commands/spec/node-status-resolvers.ts` (`resolveReadPaths`, `newestModuleReadPaths`, `unchangedSince`); `src/commands/spec/node-outcome-resolver.ts` (`recordedOutcomes`).

**Impact:** a passed verdict from one run can be pinned to the read set of an earlier or later run, so the pin claims a read set the passing run did not read, and a change to a path the passing run read can go undetected.

**Settlement condition:** the verdict and the read paths of a covered reference are correlated to one recorded run, shown by evidence that a verdict recorded by one run never takes the read paths of a different run, or a decision states that the two stores need no correlation and why.
