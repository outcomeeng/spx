# Open Issues

## Validation path layer is only consumed by literal validation

`11-ignore-defaults.pdr.md` defines `validation.paths` as the validation-specific
path layer. A path matched by `validation.paths.exclude` must be suppressed from
all validation command output, and a path outside `validation.paths.include` must
be absent from every automatic validation walk.

The runtime wiring only applies that layer in literal reuse. `src/commands/validation/literal.ts`
resolves `validationConfigDescriptor` and passes `pathConfig` into the literal
detector. `src/commands/validation/all.ts` calls lint, TypeScript, and markdown
without any resolved validation path config, and those commands do not consume
the config themselves.

**Impact:** `spx.config.yaml` can suppress literal findings while ESLint,
TypeScript, and markdown still report output from the same excluded path.

**Resolution:** Introduce a shared validation scope resolver that reads
`validation.paths` once for automatic validation walks and feeds the resulting
scope to every validation adapter. Preserve the explicit `--files` override
semantics from `11-ignore-defaults.pdr.md`.

**Skills:** `spec-tree:aligning`, `typescript:architecting-typescript`,
`typescript:testing-typescript`, `typescript:coding-typescript`,
`typescript:auditing-typescript`.
