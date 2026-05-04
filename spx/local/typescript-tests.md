# Project-Specific TypeScript Test Standards (spx)

This file is the repo-local overlay for `standardizing-typescript-tests`. Rules here supplement the shared skill — they do not repeat it.

---

## Generators are the only source of test input data

Every string and number in a test file that represents domain input — a file path, a node name, a literal value, a command argument — must come from a generator in `testing/generators/`. No exceptions.

**The literal checker (`spx validation literal`) reports `[dupe]` and `[reuse]` findings. These are test quality failures, not naming problems.**

When you see ADR-21 findings:

1. Identify the domain the value represents
2. Find the existing generator in `testing/generators/` or create one
3. Replace the hardcoded value with a generator-driven property test

**Never extract the value to a shared constant.** A constant pooling `"src/foo.ts"` across three test files is literal laundering — it still asserts on one author-chosen value and finds no new bugs.

---

## Generator inventory

The project's generators live in `testing/generators/`. Consult this directory before writing any test value by hand.

Key generators for common domains:

| Domain                                           | Generator                                     | Location                                |
| ------------------------------------------------ | --------------------------------------------- | --------------------------------------- |
| String literals (domain, min-length filtered)    | `arbitraryDomainLiteral()`                    | `testing/generators/literal/literal.ts` |
| Number literals (min-digits filtered)            | `arbitraryDomainNumber()`                     | `testing/generators/literal/literal.ts` |
| Source file paths (`src/*.ts` form)              | `arbitrarySourceFilePath()`                   | `testing/generators/literal/literal.ts` |
| Test file paths (`*.test.ts` form)               | `arbitraryTestFilePath()`                     | `testing/generators/literal/literal.ts` |
| Spec-tree test file paths (`spx/…/tests/…`)      | `arbitrarySpecTreeTestFilePath()`             | `testing/generators/literal/literal.ts` |
| Test marker file paths (`*.test.helpers.ts`)     | `arbitraryTestMarkerFilePath()`               | `testing/generators/literal/literal.ts` |
| Reuse fixture inputs (complete fixture scenario) | `LITERAL_TEST_GENERATOR.reuseFixtureInputs()` | `testing/generators/literal/literal.ts` |

If the domain you need is not in this list, **add it**. Do not hardcode.

---

## Sampling from generators

For tests that need a single deterministic value from a generator (scenario/compliance tests that call a real filesystem harness), use `sampleLiteralTestValue`:

```typescript
import { arbitrarySourceFilePath, sampleLiteralTestValue } from "@testing/generators/literal/literal";

const sourcePath = sampleLiteralTestValue(arbitrarySourceFilePath());
```

`sampleLiteralTestValue` draws one value with a fixed seed so the test is deterministic but does not repeat the hardcoded value in multiple files.

---

## Fixture harness

Tests that write files to a real temp directory use `withLiteralFixtureEnv` from `testing/harnesses/literal/harness.ts`. The harness accepts a `ReuseFixtureInputs` object produced by the generator — it does not accept raw strings.

```typescript
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { withLiteralFixtureEnv } from "@testing/harnesses/literal/harness";

const inputs = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.reuseFixtureInputs());
await withLiteralFixtureEnv({}, async (env) => {
  await env.writeReuseFixture(inputs);
  // ...
});
```
