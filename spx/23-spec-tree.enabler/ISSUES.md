# Known Issues: 23-spec-tree.enabler

The entries below are broader than this node; they are recorded here because the spec-tree governance work lives here. Tracked, not blocking.

## ADR template: the TypeScript architecting skills diverge from the canonical template

`typescript:standardizing-typescript-architecture` and `typescript:architecting-typescript` describe an ADR template — `## Purpose` / `## Context` / `## Decision` / `## Rationale` / `## Trade-offs` / `## Invariants` / `## Compliance` with `([review])` tags — that contradicts the canonical `/understanding` template they claim to derive from: decision-first (no `## Purpose` heading), `## Rationale`, `## Invariants`, `## Verification` with `### Audit` / `### Eval` / `### Testing` carrying `([audit])` / `([eval])` / evidence-type tags. `spec-tree:audit-adr` audits against the canonical template, so an ADR authored to the TypeScript skills' described template rejects on section structure and tag validity.

**Owner:** the fix is in `~/Code/outcomeeng/plugins` (the typescript plugin skill sources) — a separate product. Until then, author TypeScript ADRs to the canonical decision-first/Verification template directly, not the template the TypeScript skills describe.

## spx decision-record corpus migration to the decision-first template

Migrating the legacy decision-record corpus to the canonical decision-first/Verification template (see `CLAUDE.md` → "Decision records: the decision-first ADR/PDR template") is a deliberate, merge-gated pass by subtree — not a blocker for other work. Migrated so far: the root records (`spx/14-cli-composition.adr.md`, `spx/19-language-registration.adr.md`, `spx/15-worktree-resolution.pdr.md`) and the `spx/16-config.enabler/` ADRs (`21-descriptor-registration.adr.md`, `21-config-file-formats.adr.md`, `21-config-cli.enabler/21-cli-composition.adr.md`).

Legacy markers to migrate: the verbose ADR/PDR form (`## Purpose` / `## Context` / a `## Decision` heading / `## Trade-offs` / a `## Compliance` block with `### MUST` / `### NEVER` / `([review])` tags) and the PDR-specific `## Product invariants` heading (canonical: `## Product properties`). Re-grep the tree for these markers before each batch — the lists below are not exhaustive.

- Verbose ADRs include `spx/23-spec-tree.enabler/21-kind-registry.adr.md` and the `spx/41-validation.enabler/**` ADRs.
- PDRs still carrying `## Product invariants`: `spx/17-file-inclusion.enabler/11-ignore-defaults.pdr.md`, `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md`, `spx/36-session.enabler/11-session-frontmatter.pdr.md`, `spx/41-validation.enabler/11-tool-based-validation.pdr.md`, and `spx/36-audit.enabler/11-audit-scope.pdr.md`.

## Canonical ADR template orders Verification subsections Audit-first

The canonical ADR template (`plugins/spec-tree/skills/understanding/templates/decisions/decision-name.adr.md`) and `typescript:standardizing-typescript-architecture` list the `## Verification` subsections `### Audit` → `### Eval` → `### Testing`, while the PDR template orders them `### Testing` → `### Eval` → `### Audit` by decreasing enforcement strength, and the existing ADR corpus follows the PDR's Testing-first order. By operator decision, spx orders both record types Testing-first (decreasing enforcement strength); the ADR template's Audit-first listing is the upstream inconsistency.

**Owner:** the fix is in `~/Code/outcomeeng/plugins` (the spec-tree plugin's canonical ADR template and the typescript architecting skill) — a separate product. Reorder the ADR template's `## Verification` subsections to `### Testing` → `### Eval` → `### Audit`. Until then, author spx ADRs Testing-first per `CLAUDE.md`.
