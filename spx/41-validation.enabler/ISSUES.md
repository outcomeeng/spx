# Known Issues: 41-validation.enabler

## `allCommand` hardcodes stage dispatch (ADR-19 violation)

`src/commands/validation/all.ts` imports each stage handler by name and invokes it in a fixed sequence. This violates [ADR-19 language registration](../19-language-registration.adr.md), which mandates:

> NEVER: Hardcode language-specific dispatch in orchestration code (`allCommand`, `testCommand`, pipeline composition) — orchestration iterates over the registry.

**Scope:** all 6 stages (`circularCommand`, `knipCommand`, `lintCommand`, `typescriptCommand`, `markdownCommand`, `literalCommand`) are hardcoded. Pre-existing across 5 stages; extended this cycle with `literalCommand`.

**Consequence:** the language descriptor at `src/validation/languages/` currently has no runtime consumer. Adding a stage to a descriptor does not wire it into `allCommand`.

**Remediation:** refactor `allCommand` to iterate a typed language registry. Steps:

1. Author a proper `src/validation/registry.ts` that imports each language descriptor explicitly.
2. Extend descriptor shape so each stage carries a `run: (ctx) => Promise<ValidationCommandResult>` callable.
3. Rewrite `allCommand` to iterate `registry.languages.flatMap(l => l.stages)` and dispatch via each stage's `run`.
4. Delete the by-name imports in `src/commands/validation/all.ts`.

**Scope:** this is follow-up work, not part of any in-flight cycle.
