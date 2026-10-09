# Issues: TypeScript Runner Test Harness

## The temporary-product scenario observes the copied suite's name and not its content

The scenario "Given a committed Vitest fixture suite, when `withTempVitestProduct` runs a callback, then the suite is copied into a fresh temporary product under the OS temp root rather than the repository, the product holds exactly the copied suite, and the product directory is removed after the callback settles" links `tests/test-harness.scenario.l1.test.ts`. Its first case asserts that the directory listing observed during the callback equals `[COPIED_SUITE_NAME]`, the constant `"suite.test.ts"` that `observeTempVitestProductLifecycle` (`testing/harnesses/testing/typescript-runner.ts`) also uses to name the copy.

**Impact:** The assertion confirms that one entry carries the copy's name and cannot fail when the entry holds content other than the committed fixture suite, so "the product holds exactly the copied suite" is unobserved for the suite's content.

**Scope:** One scenario of this node's scenario test file; the callback-throws case in the same file observes removal and rethrow and is unaffected.

**Resolution:** read the copied entry during the callback and assert its content equals the committed fixture suite's content, then re-run this node's tests and its test-evidence audit.
