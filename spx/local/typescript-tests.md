# Product-Specific TypeScript Test Standards (spx)

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

The product's generators live in `testing/generators/`. Consult this directory before writing any test value by hand.

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

Executed tests do not call [`sampleLiteralTestValue`](../../testing/generators/literal/literal.ts) directly. When scenario or compliance evidence needs one deterministic generated value, add a harness assertion entrypoint that samples the governing arbitrary and performs the behavior assertion. The executed test imports that entrypoint and registers it with the test runner without declaring sampled values or configuration.

`sampleLiteralTestValue` draws one value with a fixed seed. Keeping that call behind the harness entrypoint preserves deterministic evidence without moving generator choice or sampled state into the executed test.

---

## Fixture harness

Harness assertion entrypoints that write files to a real temporary directory compose on [`withLiteralFixtureEnv`](../../testing/harnesses/literal/harness.ts). The entrypoint samples its coherent fixture input from `testing/generators/literal/literal.ts`, passes that input to the fixture environment, performs the behavior assertion, and returns the runner callback. Executed tests import and register the entrypoint; they do not own fixture inputs, environment bindings, lifecycle, or assertions over reusable setup state.

`withLiteralFixtureEnv` accepts a `LiteralReuseFixtureInputs` object produced by the generator. It does not accept raw strings.
