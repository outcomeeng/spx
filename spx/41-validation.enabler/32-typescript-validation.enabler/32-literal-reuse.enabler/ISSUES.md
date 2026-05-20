# Known Issues: 32-literal-reuse.enabler

## Allowlist writer bypasses resolved validation config

`src/validation/literal/allowlist-existing.ts` parses raw `spx.config.*`
sections directly, indexes validation section keys itself, validates only the
nested literal values descriptor, and falls back to literal defaults when that
nested section is invalid.

This conflicts with the config descriptor architecture. Consumers should receive
their resolved domain section through the config module, and descriptor
validation failures should remain failures rather than silently becoming
defaults.

The allowlist writer also runs `validateLiteralReuse` without the resolved
`validation.paths` config, so values under excluded paths can be written into
the generated allowlist.

**Impact:** `spx validation literal --allowlist-existing` can produce an
allowlist from a different scope than `spx validation literal`, and invalid
literal config can be ignored during allowlist generation.

**Resolution:** Route allowlist generation through the resolved validation
config. Keep config-file mutation in a config-owned helper that preserves the
existing file format while writing the updated allowlist path.

**Skills:** `spec-tree:aligning`, `typescript:architecting-typescript`,
`typescript:testing-typescript`, `typescript:coding-typescript`,
`typescript:auditing-typescript`.

---

## Future enhancement: per-tool path filter at `validation.paths.literal.*`

The current `validation.paths.{exclude,include}` config (governed by [`11-ignore-defaults.pdr.md`](../../../17-file-inclusion.enabler/11-ignore-defaults.pdr.md)) applies uniformly to every spx validation tool. A path listed in `validation.paths.exclude` is suppressed from literal-reuse, lint, type-check, circular-deps, knip, and AST enforcement alike.

**Gap:** A team may want to suppress a path from literal-reuse alone (e.g., a vendored library duplicates many domain strings the team has chosen to live with) without also suppressing that path from ESLint or TypeScript type-checking — those tools should still report problems against the same files.

**Proposed enhancement:** Consume `validation.paths.literal.{exclude,include}` alongside the global `validation.paths.{exclude,include}` semantic. The effective walk for the literal-reuse detector becomes `(validation.paths) ∪ (validation.paths.literal)` for excludes, `(validation.paths) ∩ (validation.paths.literal)` for includes, evaluated once before walking. The same per-tool extension applies to other tool subsections: `validation.paths.eslint.*`, `validation.paths.circular.*`, etc.

**Constraint:** spx must not edit the project's tool-native ignore configs (`.eslintignore`, `tsconfig.json` `exclude`, etc.). Running `bare eslint` against the same project must continue to surface every problem unaffected by spx config. The per-tool exclusion lives only in `spx.config.*` and is consumed by the spx wrapper around each tool.

**Scope:** Independent design pass per validation enabler. The validation descriptor already accepts per-tool path subsections under `validation.paths.<tool>`; each tool still needs its effective-scope composition wired through the owning enabler.

**Out of scope for the current cycle:** the global `validation.paths` filter governed by 11-ignore-defaults.pdr.md is sufficient for the immediate need. This enhancement is queued for when a team requires the finer-grained per-tool control.

---

## Literal value config diagnostics use shortened paths

The literal value config validator reports field errors with shortened paths
such as `literal.presets`, `literal.include`, and `literal.exclude`, while the
user-visible configuration path is `validation.literal.values.{field}`.

**Impact:** users correcting invalid `spx.config.*` files must infer the
containing `validation.literal.values` path from surrounding context instead of
receiving the exact key path in the diagnostic.

**Resolution:** update `src/validation/literal/config.ts` diagnostics to quote
the full user-visible path for every literal value config field, then adjust the
config validation tests to assert the full path strings.

**Skills:** `spec-tree:aligning`, `typescript:testing-typescript`,
`typescript:coding-typescript`, `typescript:auditing-typescript`.
