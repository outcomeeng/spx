# Resolved Issues: 65-markdown-validation.enabler

## File-scoped markdown validation treated a markdown file path as a directory

`spx validation markdown --files <markdown-file>` passed the markdown file path
to markdownlint-cli2 as its `directory` option. markdownlint-cli2 rejected that
shape because `directory` must be a directory path.

Observed while validating
`spx/41-validation.enabler/21-validation-cli.enabler/PLAN.md`:

```text
Uncaught: Error: The `cwd` option must be a path to a directory, got: /Users/shz/Code/outcomeeng/spx/spx/41-validation.enabler/21-validation-cli.enabler/PLAN.md
```

Direct markdownlint works on the same file:

```bash
pnpm exec markdownlint-cli2 spx/41-validation.enabler/21-validation-cli.enabler/PLAN.md
```

The direct command reports zero errors after formatting the plan file.

**Skills:** `typescript:coding-typescript`, `typescript:testing-typescript`,
and `spec-tree:testing`.

**Resolution:** Markdown validation now classifies `*.md` and `*.markdown`
scopes as file targets and existing directories as directory targets. Directory
targets keep recursive markdown traversal. File targets invoke markdownlint-cli2
with the containing directory as `directory` and the markdown basename as the
argv target.

**Evidence:** `markdown-validation.e2e.test.ts` now includes a generator-backed
direct-file scenario for `spx validation markdown --files <markdown-file>`.
Unit and integration markdown tests use source-owned target kinds and generated
scenario data instead of fixture-owned expected values. The direct-file evidence
also covers docs subdirectories so file-scoped docs validation keeps the same
MD024 duplicate-heading policy as directory-scoped docs validation.
