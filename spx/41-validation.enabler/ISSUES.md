# Known Issues: 41-validation.enabler

## TypeScript-validation integration test launders source-owned step display names

[`spx/41-validation.enabler/32-typescript-validation.enabler/tests/typescript-validation.integration.test.ts:20-27`](32-typescript-validation.enabler/tests/typescript-validation.integration.test.ts) declares 11 test-owned semantic constants (`NPX_INSTALL_PROMPT`, `ENOENT_MARKER`, `ESLINT_OUTPUT_MARKER`, `TSC_OUTPUT_MARKER`, `CIRCULAR_OUTPUT_MARKER`, `LITERAL_OUTPUT_MARKER`, `ESLINT_SKIP_MARKER`, `TSC_SKIP_MARKER`, `CIRCULAR_SKIP_MARKER`, `LITERAL_SKIP_MARKER`, `EXIT_SUCCESS=0`).

Eight of the eleven match per-stage display labels (`"ESLint"`, `"TypeScript"`, `"Circular"`, `"Literal"`) and the skip-prefix label (`"Skipping ESLint"`, etc.) currently inlined as string literals across [`src/commands/validation/lint.ts:12,53,78,81`](../../src/commands/validation/lint.ts), [`src/commands/validation/typescript.ts:11,40,53,56`](../../src/commands/validation/typescript.ts), [`src/commands/validation/circular.ts:11,43,56,60,65`](../../src/commands/validation/circular.ts), and [`src/commands/validation/literal.ts:48-50`](../../src/commands/validation/literal.ts).

This is an ADR-21 NEVER violation per [`32-typescript-validation.enabler/21-typescript-conventions.adr.md`](32-typescript-validation.enabler/21-typescript-conventions.adr.md): test-owned semantic constants in test files duplicate values that should originate at one source-side declaration site.

**Remediation:**

1. Add `src/validation/orchestration/step-display.ts` exporting:
   - `VALIDATION_STEP_DISPLAY_NAMES = { ESLINT: "ESLint", TYPESCRIPT: "TypeScript", CIRCULAR: "Circular dependencies", LITERAL: "Literal", KNIP: "Knip", MARKDOWN: "Markdown" } as const` and the corresponding union type
   - `VALIDATION_SKIP_VERB = "Skipping"` and a `formatStageSkipMessage(step, reason)` helper
2. Refactor each stage's `TYPESCRIPT_ABSENT_MESSAGE` and `formatSkipMessage` call to compose from the registry.
3. Rewrite the integration test to import `VALIDATION_STEP_DISPLAY_NAMES` and assert `expect(result.stdout).toContain(VALIDATION_STEP_DISPLAY_NAMES.ESLINT)` etc.
4. For the runtime tokens `"ENOENT"` and `"Need to install the following packages"`, expose a `RUNTIME_DIAGNOSTIC_ANTI_MARKERS` registry the test can import (the strings represent regressions spx orchestration must avoid emitting; that statement belongs in source as a named constraint).

**Scope:** independent of the literal-reuse refactor; a separate cleanup pass after the in-flight cycle lands.

---

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
