# PLAN: 43-precommit.enabler test rearchitecture

## What this node tests

Three pure functions and one orchestrator:

- `categorizeFile(path)` — 3-branch if-else: `.test.ts` anywhere → test, `src/` prefix → source, else → other
- `filterTestRelevantFiles(files)` — filter by `categorizeFile`
- `buildVitestArgs(files)` — split by `isTestFile`, return `[--run, ...tests]` or `[related, --run, ...sources]`
- `runPrecommitTests(deps)` — orchestrates the above with injected `getStagedFiles` + `runVitest`
- `findRelatedTestPaths(path)` — derives `tests/unit/…` and `tests/integration/…` paths from a `src/…` path

## What to investigate before writing a single test

### 1. `findRelatedTestPaths` is likely dead

`run.ts` never calls it. The production path is:
`filterTestRelevantFiles` → `buildVitestArgs` → `vitest related --run <sources>`.
`vitest related` finds related tests on its own; there is no step that calls `findRelatedTestPaths`.

The function also produces `tests/unit/` and `tests/integration/` paths — the legacy format.
Current tests live at `spx/*/tests/`. So the function's output is structurally wrong for the current codebase.

**Decision needed**: delete the function and remove its spec assertion, or wire it into the production path if it still has a role.

### 2. Two `FILE_PATTERNS` exports with different content

`build-args.ts` exports `FILE_PATTERNS = { TEST_FILE: /\.test\.(ts|tsx|js|jsx)$/ }`.
`categorize.ts` exports `FILE_PATTERNS = { TEST_FILE_SUFFIX, SOURCE_DIR, TESTS_DIR, … }`.

They share the same export name but are unrelated objects. Both are imported by the test files.
`categorize.ts` checks `includes(".test.ts")` while `build-args.ts`'s `isTestFile` uses the regex matching `.test.ts`, `.test.tsx`, `.test.js`, `.test.jsx` — different domains.

**Decision needed**: consolidate into one classifier. If the precommit hook is TypeScript-only (`spx` is a TypeScript project), `.test.tsx`, `.test.js`, `.test.jsx` matching may be unnecessary noise.

### 3. Spec-mandated property tests are not written

The spec lists:

- "Classification is deterministic: for every path `p`, `categorizeFile(p)` returns the same category on repeated calls"
- "Test-relevance filter is idempotent: for every file list `F`, `filterTestRelevantFiles(filterTestRelevantFiles(F))` equals `filterTestRelevantFiles(F)`"

Neither is written as `fc.assert(fc.property(...))`. They exist as prose in the spec but are absent from the test files.

### 4. ADR-21 findings are a symptom, not the problem

The 67 literal-reuse findings (`"tests/unit/foo.test.ts"`, `"src/foo.ts"`, `"README.md"`, etc.) all come from example-based tests for trivially simple functions. The real issue: testing a 3-branch function with 15 specific examples checks 15 paths but establishes no invariant.

## Proposed rearchitecture (pending investigation above)

After resolving the two structural questions (dead function, two FILE_PATTERNS):

### Generators needed

A new `testing/generators/precommit/precommit.ts` with:

- `arbitraryPrecommitTestFilePath()` — generates paths containing `.test.ts`
- `arbitraryPrecommitOtherFilePath()` — generates paths that don't start with `src/` and don't contain `.test.ts`

The existing `arbitrarySourceFilePath()` from `@testing/generators/literal/literal` covers `src/*.ts`.

### Test structure after rearchitecture

| Spec assertion                               | Test file                        | Evidence | Approach                                                                                       |
| -------------------------------------------- | -------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `categorizeFile` classification mapping      | `categorize.mapping.l1.test.ts`  | mapping  | `fc.property` over each of the 3 path classes                                                  |
| Classification is deterministic              | `categorize.property.l1.test.ts` | property | `fc.property(fc.string(), path => categorizeFile(path) === categorizeFile(path))`              |
| Filter idempotency                           | `categorize.property.l1.test.ts` | property | `fc.property(fc.array(fc.string()), files => deepEqual(filter(filter(files)), filter(files)))` |
| `buildVitestArgs` invocation shape           | `build-args.mapping.l1.test.ts`  | mapping  | `fc.property` over `fc.array(arbitraryPrecommitTestFilePath())` etc.                           |
| `runPrecommitTests` skip/propagate scenarios | `run.scenario.l1.test.ts`        | scenario | Keep current DI structure; replace hardcoded file paths with generated paths                   |
| Lefthook integration scenarios               | `precommit.integration.test.ts`  | scenario | No changes needed; integration test is structurally correct                                    |

### Files to rename (`.unit.test.ts` → methodology names)

`build-args.unit.test.ts` → `build-args.mapping.l1.test.ts` + `build-args.property.l1.test.ts`
`categorize.unit.test.ts` → `categorize.mapping.l1.test.ts` + `categorize.property.l1.test.ts`
`run.unit.test.ts` → `run.scenario.l1.test.ts` + `run.compliance.l1.test.ts`

## What to do first

1. Check whether `findRelatedTestPaths` is called anywhere in production code (`grep -r findRelatedTestPaths src/`).
   If not called: remove it from `categorize.ts` and from the spec.
2. Decide on one `FILE_PATTERNS` export and one `isTestFile` implementation.
3. Once the source is settled, write generators and replace tests.
