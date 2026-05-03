# Known Issues: 32-literal-reuse.enabler

## Future enhancement: per-tool path filter at `validation.literal.paths.*`

The current `validation.paths.{exclude,include}` config (governed by [`11-ignore-defaults.pdr.md`](../../../17-file-inclusion.enabler/11-ignore-defaults.pdr.md)) applies uniformly to every spx validation tool. A path listed in `validation.paths.exclude` is suppressed from literal-reuse, lint, type-check, circular-deps, knip, and AST enforcement alike.

**Gap:** A team may want to suppress a path from literal-reuse alone (e.g., a vendored library duplicates many domain strings the team has chosen to live with) without also suppressing that path from ESLint or TypeScript type-checking — those tools should still report problems against the same files.

**Proposed enhancement:** Introduce `validation.literal.paths.{exclude,include}` mirroring the `validation.paths` semantic. The effective walk for the literal-reuse detector becomes `(validation.paths) ∪ (validation.literal.paths)` for excludes, `(validation.paths) ∩ (validation.literal.paths)` for includes, evaluated once before walking. The same per-tool extension would apply to other tool subsections: `validation.lint.paths.*`, `validation.circular.paths.*`, etc.

**Constraint:** spx must not edit the project's tool-native ignore configs (`.eslintignore`, `tsconfig.json` `exclude`, etc.). Running `bare eslint` against the same project must continue to surface every problem unaffected by spx config. The per-tool exclusion lives only in `spx.config.*` and is consumed by the spx wrapper around each tool.

**Scope:** Independent design pass per validation enabler. The `values` nesting introduced by [`21-allowlist-config.adr.md`](32-value-allowlist.enabler/21-allowlist-config.adr.md) reserves the `validation.literal` namespace for this future subsection — no further restructuring of the literal config is needed when this work picks up.

**Out of scope for the current cycle:** the global `validation.paths` filter governed by 11-ignore-defaults.pdr.md is sufficient for the immediate need. This enhancement is queued for when a team requires the finer-grained per-tool control.
