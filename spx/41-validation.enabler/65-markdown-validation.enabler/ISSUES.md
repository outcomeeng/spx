# Issues: 65-markdown-validation.enabler

## Relative markdown path operands are filtered out before validation

`spx validation markdown <relative-markdown-file>` can skip valid Markdown
file scopes before invoking markdownlint.

Observed on June 10, 2026 while validating audit-boundary ADR and spec edits:

```bash
pnpm exec tsx src/cli.ts validation markdown spx/36-audit.enabler/21-audit-module-structure.adr.md spx/36-audit.enabler/32-verify.enabler/21-verdict-reader.enabler/21-verdict-reader.adr.md spx/36-audit.enabler/32-verify.enabler/21-verify-pipeline.adr.md spx/36-audit.enabler/32-verify.enabler/21-verdict-reader.enabler/verdict-reader.md spx/36-audit.enabler/32-verify.enabler/verify.md spx/36-audit.enabler/audit.md spx/36-audit.enabler/32-verify.enabler/32-structural.enabler/structural.md spx/36-audit.enabler/32-verify.enabler/43-semantic.enabler/semantic.md spx/36-audit.enabler/32-verify.enabler/54-paths.enabler/paths.md
```

Output:

```text
Markdown: skipped (no markdown files in explicit path scope)
```

The unscoped command passed on the same worktree:

```bash
pnpm exec tsx src/cli.ts validation markdown
```

```text
Markdown: No issues found
```

Probable fault line: `src/commands/validation/markdown.ts` resolves file scopes
through `resolveMarkdownValidationTarget(filePath)`, then filters targets with
`pathPassesValidationFilter(relative(cwd, target.path), pathFilter)`. Relative
input paths remain relative target paths, so the later `relative(cwd, target.path)`
calculation can produce a path outside the validation path filter even though
the file exists.

**Impact:** Focused Markdown validation evidence can be false-green because the
command exits 0 after skipping all relative file scopes.

**Tracking classification:** Tracked deferral, chosen by the operator during the
audit-boundary work on June 10, 2026.

**Revisit condition:** Fix before changing Markdown validation scoping or
validation path-filter semantics; add integration evidence for relative file
scopes and keep the unscoped Markdown gate as the fallback until then.

**Skills:** `spec-tree:contextualizing`, `spec-tree:applying`,
`typescript:testing-typescript`, `typescript:coding-typescript`,
`typescript:auditing-typescript-tests`, and `typescript:auditing-typescript`.

## FOLLOW-UP: Mapping and Compliance assertions link to the scenario test

`markdown-validation.scenario.l1.test.ts` (renamed from the legacy `.unit` name) is a
single scenario loop, but `markdown-validation.md` links its Mapping assertions
(link-type resolution, enabled built-in rules) and Compliance assertions (no
side effects, never validate outside `spx/`/`docs/`) to it. A scenario test is not
mapping or compliance evidence.

**Resolution:** split dedicated `markdown-validation.mapping.l1.test.ts` and
`markdown-validation.compliance.l1.test.ts` out of the scenario loop and repoint
those assertions' `[test]` links. Fold this with the broader reclassification of
this node's `.integration`/`.e2e` tests tracked alongside the test-evidence-naming
enforcement rule.

**Skills:** `typescript:testing-typescript`, `spec-tree:applying`.
