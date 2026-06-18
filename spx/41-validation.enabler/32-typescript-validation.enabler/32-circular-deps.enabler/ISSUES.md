# Open Issues

## Circular command ignores scope option

Observed in PR #199 review on June 18, 2026: `spx validation circular` registers the common `--scope <scope>` option through the validation CLI, but the circular command handler does not pass `options.scope` to `circularCommand`, and circular validation uses the full TypeScript scope.

**Impact:** `pnpm run validate:published` now runs `validation all --scope production --skip-circular`, while `pnpm run circular:published` runs the circular command against full scope. That split makes the existing circular-scope behavior more visible to operators expecting production-scope parity.

**Skills:** `spec-tree:contextualize`, `spec-tree:apply`, `typescript:code-typescript`, `typescript:test-typescript`, `typescript:audit-typescript-tests`, and `typescript:audit-typescript`.

**Resolution:** Add explicit scope support to `spx validation circular`, pass the scope through `circularCommand`, update the circular dependency assertions and tests for full and production scope, then run `pnpm run validate`, `pnpm run circular`, and `pnpm test`.
