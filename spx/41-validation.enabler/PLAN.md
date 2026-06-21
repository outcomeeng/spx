# Plan: Validation

## Harness governance (queued)

Govern the still-ungoverned validation test harnesses and generators per the **Remaining harness governance program** in `spx/PLAN.md` (uniform approach, audit gates, and literal-collision lessons). One PR for this batch.

Modules to govern (place each governing node beside its owning sub-enabler):

- `testing/harnesses/validation/cli.ts` → `spx/41-validation.enabler/21-validation-cli.enabler`
- `testing/harnesses/validation/eslint.ts`, `testing/harnesses/validation/lint-policy.ts` → `spx/41-validation.enabler/32-typescript-validation.enabler/32-lint.enabler` (and `32-ast-enforcement.enabler`)
- `testing/harnesses/validation/markdown.ts` → `spx/41-validation.enabler/65-markdown-validation.enabler`
- `testing/harnesses/validation/pipeline.ts`, `testing/harnesses/validation/subprocess.ts`, `testing/harnesses/with-validation-env.ts` → `spx/41-validation.enabler` (cross-cutting; subprocess is shared with the CLI batch — reconcile, do not duplicate)
- `testing/generators/validation/{ast-enforcement,lint-policy,markdown,validation}.ts` → the same sub-enablers (a `…-generators.enabler` or a shared generators node)

Route: `/understand` → `/contextualize spx/41-validation.enabler` → `/author` per-module test-harness/generator enablers → `/apply` audit gates (spec-auditor + test-evidence-auditor, including the coverage gate) → `/merge`.
