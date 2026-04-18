# Issues

## Parent spec has broken test links

`validation.md` assertions reference `tests/validation.integration.test.ts` and `tests/validation.unit.test.ts` which do not exist. These are cross-cutting parent tests that verify composition across all language subtrees. Pre-existing since commit `71ce03c`.

**Resolution:** Author the two test files or demote the assertions to `[review]`.

## eslintStep exported without language gate

`src/validation/steps/eslint.ts` exports `eslintStep` (a `ValidationStep` object) whose `enabled` predicate checks only `enabledValidations[ESLINT]` and an environment variable — it does not consult language detection. Currently dead code (the production CLI routes through `lintCommand` which has the gate), but if a future orchestrator wires `eslintStep` directly, the language-detection regression returns.

**Resolution:** Either remove the export (it's unused) or add a language-detection check to `eslintStep.enabled`.

## validateESLint uses process.cwd() instead of projectRoot

`src/validation/steps/eslint.ts:113` spawns ESLint with `cwd: process.cwd()` rather than `context.projectRoot`. This works because the CLI process inherits the correct cwd, but it's fragile if the function is ever called from a different process context.

**Resolution:** Use `context.projectRoot` as the cwd for the spawned process.
