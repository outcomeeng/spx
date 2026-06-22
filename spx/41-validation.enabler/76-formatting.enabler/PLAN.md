# Plan: dprint formatting validation stage

The repo-tracked `dprint.jsonc`, the pinned `dprint` devDependency, and the
checksum-pinned plugins are on the default branch; the product baseline is
`dprint`-clean; and the integration architecture is decided in
`21-dprint-integration.adr.md`. What remains is implementing formatting as a
governed `spx validation all` stage.

## Remaining implementation (via /apply, resuming at the test step)

1. **Write the co-located evidence** for each assertion (`formatting.scenario.l2`,
   `formatting.scenario.l3`, `formatting.mapping.l1`, `formatting.property.l1`,
   `formatting.compliance.l1`), mirroring the markdown-validation test infrastructure:
   a generator under `testing/generators/validation/` plus a driver harness under
   `testing/harnesses/validation/` that runs the stage against a fixture project
   carrying a `dprint.jsonc`. Then `/audit-typescript-tests`.
2. **Implement the stage** per `21-dprint-integration.adr.md`: the subprocess step in
   `src/validation/steps/formatting.ts`, the command in
   `src/commands/validation/formatting.ts` (named `formatting.ts` — `format.ts` already
   holds the validation output-formatting helpers), the `ValidationLanguageDescriptor`
   in `src/validation/languages/formatting.ts` registered through
   `src/validation/registry.ts` per `spx/19-language-registration.adr.md`, `spx.config.*`
   participation per `spx/41-validation.enabler/21-validation-configuration.adr.md`, the
   `spx validation format` CLI registration, and a stage display name. Then
   `/audit-typescript`.
3. **Remove this node from `spx/EXCLUDE`** once tests and implementation exist, so
   `spx validation all` enforces formatting.

## CI enforcement comes for free

Once formatting is a registered stage in `spx validation all`, CI's existing
`pnpm run validate` step enforces it — no separate `format:check` step in
`.github/workflows/ci.yml` is needed. The standalone `format` / `format:check`
package scripts then become developer conveniences, or are retired in favor of
`spx validation format`.

## Placement

Additive leaf gate at index 76 under `spx/41-validation.enabler/`, independent of the
language gates (32) and markdown (65), depending on the validation-cli infrastructure (21)
and the registry. Validation is additive, so the stage's pipeline position does not change
any existing verdict.
