# Issues: Git Utility

## f-001 — Conformance and property registration tests hide their predicates inside the harness

Rule: assertion-seam. Remediation target: test-file. Harness file: `testing/harnesses/git/changed-paths.ts`.

Two assertions of the node are linked to registration tests that only call a register function, while the harness owns every `expect` call and every expected value:

- "A committed range maps base and head to the product paths emitted by git diff --name-status -z base..head": `registerGitUtilityConformanceTests` calls `expect(changedPathsForCommittedRange(...))` inside the harness.
- "Rename and copy name-status records include every product path the record names": `registerGitUtilityPropertyTests` calls `expect(pathsFromNameStatus(...)).toEqual(uniqueSorted(paths))` inside the harness.

### Evidence

- The linked tests `tests/git-utility.conformance.l1.test.ts` and `tests/git-utility.property.l1.test.ts` are three-line registration tests that call only a register function.
- The pass/fail predicate and the expected values are not visible in the linked test files, so the tests fail predicate inversion: inverting a predicate in the harness changes the verdict without any change to the linked test.
- The changeset that surfaced the finding changes only `git-utility.md`, `tests/git-environment.property.l1.test.ts`, `src/lib/git/environment.ts`, and `testing/generators/git-environment/git-environment.ts`; `testing/harnesses/git/changed-paths.ts` and the two registration tests are unchanged by it.

### Impact

The two assertions carry evidence whose verdict a reader of the linked test cannot see or audit from the test file. Test-evidence audit of the node rejects them at the assertion seam.

### Settlement condition

The finding is settled when the predicates of both assertions are stated in the linked test functions, with the harness returning observations only, and a test-evidence audit of the node reports no assertion-seam finding for these two assertions.
