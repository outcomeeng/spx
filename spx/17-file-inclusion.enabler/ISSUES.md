# Open Issues

## Validation explicit file scope conflicts with file-inclusion override

[`spx/17-file-inclusion.enabler/11-ignore-defaults.pdr.md`](11-ignore-defaults.pdr.md)
and [`spx/17-file-inclusion.enabler/file-inclusion.md`](file-inclusion.md)
declare that caller-supplied explicit paths bypass every domain filter, with
[`spx/17-file-inclusion.enabler/15-scope-composition.adr.md`](15-scope-composition.adr.md)
defining the explicit-override pipeline invariant. The validation ADR declares
the opposite for validation scope:
[`spx/41-validation.enabler/21-validation-configuration.adr.md`](../41-validation.enabler/21-validation-configuration.adr.md)
says explicit caller paths intersect SPX validation path configuration.

The automatic-walk side already consumes validation path filters through
`validationPathFilterForTool`, `applyValidationPathFilterToScope`, or
`pathPassesValidationFilter` in the current validation commands. The explicit
scope behavior follows the validation ADR:
[`src/commands/validation/lint.ts`](../../src/commands/validation/lint.ts),
[`src/commands/validation/typescript.ts`](../../src/commands/validation/typescript.ts),
[`src/commands/validation/markdown.ts`](../../src/commands/validation/markdown.ts),
and [`src/commands/validation/literal.ts`](../../src/commands/validation/literal.ts)
filter `--files` through `validation.paths`, so an explicit caller path can be
dropped before the tool runs. Literal validation passes `files` and `pathConfig`
to `validateLiteralReuse`, whose `applyPathFilter` step filters the resolved
explicit-path scope. `spx validation all --files ...` inherits the same behavior
for those stages. Observed on June 12, 2026:

```bash
tsx src/cli.ts validation lint --files spx/36-audit.enabler/tests/audit.scenario.l1.test.ts
```

```text
Skipping ESLint (validation paths matched no files)
```

The same command shape against a file outside `validation.paths.exclude` runs
ESLint normally:

```bash
tsx src/cli.ts validation lint --files spx/41-test.enabler/tests/test.scenario.l1.test.ts
```

```text
ESLint: ✓ No errors found
```

**Impact:** focused explicit-path lint, TypeScript, markdown, literal, and
`validation all --files` invocations can skip files the caller intentionally
named, while maintainers have two conflicting product-truth sources for whether
that skip is correct.

**Resolution:** Reconcile the validation ADR with the file-inclusion
explicit-override contract before changing runtime behavior. If validation keeps
the intersection rule, record the validation-specific carve-out in the
file-inclusion contract. If file-inclusion's explicit override governs
validation, update the validation ADR first, then route validation `--files`
handling through a shared helper that normalizes explicit paths without applying
domain path filters to them, including the `validateLiteralReuse` /
`applyPathFilter` integration point.

**Skills:** `spec-tree:aligning`, `typescript:architecting-typescript`,
`typescript:testing-typescript`, `typescript:coding-typescript`,
`typescript:auditing-typescript`.
