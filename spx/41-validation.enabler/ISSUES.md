# Known Issues: 41-validation.enabler

## `allCommand` hardcodes stage dispatch (ADR-19 violation)

`src/commands/validation/all.ts` imports each stage handler by name and invokes it in a fixed sequence. This violates [ADR-19 language registration](../19-language-registration.adr.md), which mandates:

> NEVER: Hardcode language-specific dispatch in orchestration code (`allCommand`, `testCommand`, pipeline composition) — orchestration iterates over the registry.

**Scope:** all 6 stages (`circularCommand`, `knipCommand`, `lintCommand`, `typescriptCommand`, `markdownCommand`, `literalCommand`) are hardcoded. Pre-existing across 5 stages; extended this cycle with `literalCommand`.

**Consequence:** no language registry exists — the prior `src/validation/languages/` descriptor stub was removed as vacuous. Every stage is wired by direct import from `src/commands/validation/{stage}.ts` into `allCommand`, with a hardcoded `TOTAL_STEPS = 5` constant that excludes the `literalCommand` stage from the `[N/5]` progress label.

**Remediation:** refactor `allCommand` to iterate a typed language registry. Steps:

1. Author `src/validation/registry.ts` that imports each language descriptor explicitly.
2. Author language descriptors at `src/validation/languages/{language}.ts` with a typed stage shape; each stage carries a `run: (ctx) => Promise<ValidationCommandResult>` callable.
3. Rewrite `allCommand` to iterate `registry.languages.flatMap(l => l.stages)` and dispatch via each stage's `run`.
4. Derive step count from the stage list — replace the `TOTAL_STEPS = 5` constant with `stages.length`, so appending or removing a stage self-numbers without a constant update.
5. Delete the by-name imports in `src/commands/validation/all.ts`.
6. Update `spx/41-validation.enabler/tests/validation.integration.test.ts` to derive its expected step count from the registry rather than hardcoding `TOTAL_STEPS = 5`.

**Scope:** this is follow-up work, not part of any in-flight cycle.
