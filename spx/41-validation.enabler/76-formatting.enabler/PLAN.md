# Plan: dprint formatting validation stage

The repo-tracked `dprint.jsonc` config, the pinned `dprint` devDependency, and the
checksum-pinned plugins are already on the default branch. What remains is making
formatting a governed validation stage and reformatting the baseline.

## Remaining implementation (via /apply)

1. **Reformat the baseline.** Run `pnpm run format` so `dprint check` is green across the
   tracked tree, in one focused changeset; rerun `pnpm run format:check`, `pnpm run validate`,
   and `pnpm test`. The live file list comes from `pnpm run format:check` (around 50 at the
   time of writing).
2. **Author the integration ADR** (via /architect-typescript) declaring how dprint integrates:
   subprocess `dprint check` versus a programmatic invocation, product-root config resolution,
   registration as a `ValidationLanguageDescriptor` composed through `src/validation/registry.ts`
   per `spx/19-language-registration.adr.md`, and `spx.config.*` governance per
   `spx/41-validation.enabler/21-validation-configuration.adr.md`. The
   `spx/41-validation.enabler/65-markdown-validation.enabler/21-markdownlint-integration.adr.md`
   is the precedent for a cross-cutting single-tool gate.
3. **Implement the stage** (via /apply): the descriptor under `src/validation/`, registry
   registration, the `spx validation format` subcommand, and `spx.config.*` participation —
   with co-located tests for each assertion (`formatting.scenario.l2`, `formatting.scenario.l3`,
   `formatting.mapping.l1`, `formatting.property.l1`, `formatting.compliance.l1`).
4. **Remove this node from `spx/EXCLUDE`** once tests and implementation exist.

## CI enforcement comes for free

Once formatting is a registered stage in `spx validation all`, CI's existing `pnpm run validate`
step enforces it — no separate `format:check` step in `.github/workflows/ci.yml` is needed. The
standalone `format` / `format:check` package scripts then become developer conveniences, or are
retired in favor of `spx validation format`.

## Placement

Additive leaf gate at index 76 under `spx/41-validation.enabler/`, independent of the language
gates (32) and markdown (65), depending on the validation-cli infrastructure (21) and the
registry. Validation is additive, so the stage's pipeline position does not change any existing
verdict.
