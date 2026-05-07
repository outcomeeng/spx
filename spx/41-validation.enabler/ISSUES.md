# Known Issues: 41-validation.enabler

## `allCommand` hardcodes stage dispatch (ADR-19 violation)

`src/commands/validation/all.ts` imports each stage handler by name and invokes it in a fixed sequence. This violates [ADR-19 language registration](../19-language-registration.adr.md), which mandates:

> NEVER: Hardcode language-specific dispatch in orchestration code (`allCommand`, `testCommand`, pipeline composition) — orchestration iterates over the registry.

**Scope:** all 6 stages (`circularCommand`, `knipCommand`, `lintCommand`, `typescriptCommand`, `markdownCommand`, `literalCommand`) are hardcoded. `literalCommand` participates in the same direct-dispatch pattern as the other validation stages.

**Consequence:** no language registry exists. The prior `src/validation/languages/` descriptor stub was removed as vacuous. Every stage is wired by direct import from `src/commands/validation/{stage}.ts` into `allCommand`, with a hardcoded `TOTAL_STEPS = 6` constant that must be updated manually whenever stages are added or removed.

**Remediation:** refactor `allCommand` to iterate a typed language registry. Steps:

1. Author `src/validation/registry.ts` that imports each language descriptor explicitly.
2. Author language descriptors at `src/validation/languages/{language}.ts` with a typed stage shape; each stage carries a `run: (ctx) => Promise<ValidationCommandResult>` callable.
3. Rewrite `allCommand` to iterate `registry.languages.flatMap(l => l.stages)` and dispatch via each stage's `run`.
4. Derive step count from the stage list — replace the `TOTAL_STEPS = 5` constant with `stages.length`, so appending or removing a stage self-numbers without a constant update.
5. Delete the by-name imports in `src/commands/validation/all.ts`.
6. Update `spx/41-validation.enabler/tests/validation.integration.test.ts` to derive its expected step count from the registry rather than hardcoding `TOTAL_STEPS = 5`.

**Scope:** this is follow-up work, not part of any in-flight cycle.

---

## Positional path arguments to replace `--files` flag

All `spx validation <step>` subcommands currently accept `--files <paths...>` to scope which files are validated. The flag is redundant naming — paths are paths. ESLint, ruff, mypy, and cat all accept files and directories as positional arguments with no flag:

```
eslint src/
ruff check src/ tests/
mypy src/
cat *.md /tmp/drafts/ > out.md
```

The equivalent spx interface would be:

```
spx validation literal              # whole project
spx validation literal src/         # directory
spx validation literal src/ tests/  # two directories
spx validation all src/             # all validators scoped to src/
```

**Scope:** every `spx validation <step>` subcommand and the `spx validation all` orchestrator. The orchestrator must thread positional paths through to each validator's stage runner.

**Affected nodes:**

- `21-validation-cli.enabler` — CLI surface (argument parsing convention)
- `17-file-inclusion.enabler` — directory expansion behavior (walking a directory to its language-appropriate files); current spec says nothing about directory input, only explicit file lists
- Every leaf validator enabler (lint, type-check, ast-enforcement, circular-deps, literal-reuse, markdown)

**Related gap:** `17-file-inclusion.enabler` does not currently declare directory expansion behavior. When a directory is supplied, the resolver should walk it and return all language-appropriate files (`.ts`/`.tsx` for TypeScript, `.py` for Python, etc.) as if they were supplied explicitly. This gap exists independently of the positional-args decision.

**Decision needed:** PDR at `41-validation.enabler` level establishing positional paths as the convention for all validation subcommands, with `--files` deprecated or removed.

**Constraint:** `32-literal-reuse.enabler` output-mode redesign (in-flight) retains `--files` as-is. Apply the positional-args change after the PDR is authored and as a separate pass across all affected nodes.

**Scope:** follow-up work, not part of any in-flight cycle.

---

## PR 15 review follow-ups for validation metadata and markdown targets

The review on
[`outcomeeng/spx#15`](https://github.com/outcomeeng/spx/pull/15#issuecomment-4398198837)
identified non-blocking follow-ups after the validation-gate cleanup:

- [`src/commands/validation/messages.ts`](../../src/commands/validation/messages.ts)
  exposes `formatValidationSkipMessage(stageName)`, but the function always
  uses the TypeScript-absent skip reason. Rename it to
  `formatTypeScriptAbsentSkipMessage(stageName)` or accept a source-owned
  reason parameter.
- [`src/validation/steps/markdown.ts`](../../src/validation/steps/markdown.ts)
  classifies `.markdown` file scopes as markdown targets, while directory
  targets still recurse with the existing `**/*.md` glob. Directory-scoped
  `.markdown` discovery needs a product decision because the cleanup plan kept
  the current directory recursion behavior.
- [`src/commands/validation/messages.ts`](../../src/commands/validation/messages.ts)
  re-exports runtime anti-markers under
  `VALIDATION_RUNTIME_DIAGNOSTIC_ANTI_MARKERS`. Choose one canonical import path
  for runtime anti-marker constants and remove the alias if it is unnecessary.
- [`src/commands/validation/messages.ts`](../../src/commands/validation/messages.ts)
  keeps the validation step-line denominator as a regex literal in
  `VALIDATION_STEP_LINE_PATTERN`. Add a source-owned assertion or comment tying
  the regex to `VALIDATION_PIPELINE.TOTAL_STEPS`.
- [`testing/generators/validation/ast-enforcement.ts`](../../testing/generators/validation/ast-enforcement.ts)
  exports `VALIDATION_PIPELINE_STAGE_NAMES` as an alias for
  `VALIDATION_STAGE_DISPLAY_NAMES`. Fold this into the canonical validation
  metadata import-path cleanup.
- [`testing/generators/validation/validation.ts`](../../testing/generators/validation/validation.ts)
  exposes `sampleValidationCliTestValue()` as a thin wrapper around
  `sampleLiteralTestValue()`. Give the helper a distinct validation contract or
  import the canonical sampler at call sites.
- [`testing/generators/validation/ast-enforcement.ts`](../../testing/generators/validation/ast-enforcement.ts)
  names `VALIDATION_ESLINT_EXPECTED.zeroDiagnostics` with a label that repeats
  its value. Rename it to describe the validation invariant or remove the
  extra name.
- [`src/validation/steps/subprocess-output.ts`](../../src/validation/steps/subprocess-output.ts)
  forwards child-process output with direct `write()` calls. Decide whether this
  helper should catch stream write errors or handle backpressure for large
  validation subprocess output.
- [`src/validation/steps/markdown.ts`](../../src/validation/steps/markdown.ts)
  uses direct `statSync` filesystem access inside markdown target
  classification. Decide whether target classification should accept injected
  filesystem dependencies like the TypeScript validator does.
- [`testing/harnesses/validation/markdown.ts`](../../testing/harnesses/validation/markdown.ts)
  throws the scenario title when a fixture-backed markdown scenario has no
  fixture. Replace that with an explicit harness error message.
- [`eslint-rules/no-spec-references.ts`](../../eslint-rules/no-spec-references.ts)
  exempts `testing/generators/validation/ast-enforcement.ts` because that
  generator owns ADR/PDR snippets used to test the rule. Add a short comment so
  the exemption remains readable.
- [`src/commands/validation/markdown.ts`](../../src/commands/validation/markdown.ts)
  silently skips file scopes that are neither existing directories nor markdown
  paths. Decide whether explicit missing or unrelated file scopes need user
  diagnostics.

**Impact:** These findings do not block the validation gate or markdown
file-target fix. They are cleanup and follow-up design items.

**Resolution:** Address in a separate validation metadata/markdown-target pass
after PR 15, keeping the current PR scoped to clearing the blocking literal
gate and fixing direct markdown-file scopes.
