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
