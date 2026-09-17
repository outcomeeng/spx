# Issues — Changed-Set Planning

## Path-consumed inert fixtures remain unresolved

**Evidence:** `pnpm exec tsx src/cli.ts test --changed --base origin/main` passes the linked Spec Tree surface conformance test while reporting `testing/fixtures/spec-tree/public-surface-consumer.ts` under `No related-test capability resolved these changed source files`. The conformance harness passes that fixture's path to the TypeScript compiler. Importing the fixture as an executable module solely to expose its path violates the inert-fixture boundary.

**Impact:** Changed-test selection reports a coverage gap for a fixture whose consumer test is selected and passes. The diagnostic cannot distinguish a path-consumed evidence dependency from an untested source file, reducing confidence in unresolved-path reports.

**Resolution:** The TypeScript related-test capability needs an explicit, deterministic way to attribute path-consumed inert fixtures to their consuming tests without importing or executing the fixture. The issue is resolved when changing such a fixture selects its linked test and removes the unresolved-path diagnostic while unrelated path literals remain ignored.
