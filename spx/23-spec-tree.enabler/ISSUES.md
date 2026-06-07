# Known Issues: 23-spec-tree.enabler

Both entries were discovered while authoring `26-filename-grammar.adr.md`. They are broader than this node; recorded here because the filename-grammar work lives here. Tracked, not blocking.

## ADR template: the TypeScript architecting skills diverge from the canonical template

`typescript:standardizing-typescript-architecture` and `typescript:architecting-typescript` describe an ADR template — `## Purpose` / `## Context` / `## Decision` / `## Rationale` / `## Trade-offs` / `## Invariants` / `## Compliance` with `([review])` tags — that contradicts the canonical `/understanding` template they claim to derive from: decision-first (no `## Purpose` heading), `## Rationale`, `## Invariants`, `## Verification` with `### Audit` / `### Eval` / `### Testing` carrying `([audit])` / `([eval])` / evidence-type tags. `spec-tree:audit-adr` audits against the canonical template, so an ADR authored to the TypeScript skills' described template rejects on section structure and tag validity.

**Owner:** the fix is in `~/Code/outcomeeng/plugins` (the typescript plugin skill sources) — a separate product. Until then, author TypeScript ADRs to the canonical decision-first/Verification template directly, not the template the TypeScript skills describe.

## spx decision-record corpus migration to the decision-first template

Migrating the legacy decision-record corpus to the canonical decision-first/Verification template (see `CLAUDE.md` → "Decision records: the decision-first ADR/PDR template") is a deliberate, merge-gated pass by subtree — not a blocker for other work. Migrated so far: `spx/14-cli-composition.adr.md`, `spx/19-language-registration.adr.md`, and `spx/15-worktree-resolution.pdr.md` (the root records).

Legacy markers to migrate: the verbose ADR/PDR form (`## Purpose` / `## Context` / a `## Decision` heading / `## Trade-offs` / a `## Compliance` block with `### MUST` / `### NEVER` / `([review])` tags) and the PDR-specific `## Product invariants` heading (canonical: `## Product properties`). Re-grep the tree for these markers before each batch — the lists below are not exhaustive.

- Verbose ADRs include `spx/23-spec-tree.enabler/21-kind-registry.adr.md` and the `spx/41-validation.enabler/**` ADRs.
- PDRs still carrying `## Product invariants`: `spx/17-file-inclusion.enabler/11-ignore-defaults.pdr.md`, `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md`, `spx/36-session.enabler/11-session-frontmatter.pdr.md`, `spx/41-validation.enabler/11-tool-based-validation.pdr.md`, and `spx/36-audit.enabler/11-audit-scope.pdr.md`.
