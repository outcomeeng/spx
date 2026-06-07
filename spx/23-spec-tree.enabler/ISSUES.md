# Known Issues: 23-spec-tree.enabler

The entries below are broader than this node; they are recorded here because the spec-tree governance work lives here. Tracked, not blocking.

## ADR template: the TypeScript architecting skills diverge from the canonical template

`typescript:standardizing-typescript-architecture` and `typescript:architecting-typescript` describe an ADR template — `## Purpose` / `## Context` / `## Decision` / `## Rationale` / `## Trade-offs` / `## Invariants` / `## Compliance` with `([review])` tags — that contradicts the canonical `/understanding` template they claim to derive from: decision-first (no `## Purpose` heading), `## Rationale`, `## Invariants`, `## Verification` with `### Audit` / `### Eval` / `### Testing` carrying `([audit])` / `([eval])` / evidence-type tags. `spec-tree:audit-adr` audits against the canonical template, so an ADR authored to the TypeScript skills' described template rejects on section structure and tag validity.

**Owner:** the fix is in `~/Code/outcomeeng/plugins` (the typescript plugin skill sources) — a separate product. Until then, author TypeScript ADRs to the canonical decision-first/Verification template directly, not the template the TypeScript skills describe.

## spx decision-record corpus migration to the decision-first template

Migrating the legacy decision-record corpus to the canonical decision-first/Verification template (see `CLAUDE.md` → "Decision records: the decision-first ADR/PDR template") is a deliberate, merge-gated pass by subtree — not a blocker for other work. Migrated so far: the root records (`spx/14-cli-composition.adr.md`, `spx/19-language-registration.adr.md`, `spx/15-worktree-resolution.pdr.md`), the `spx/16-config.enabler/` ADRs (`21-descriptor-registration.adr.md`, `21-config-file-formats.adr.md`, `21-config-cli.enabler/21-cli-composition.adr.md`), the `spx/22-test-environment.enabler/` ADRs (`21-callback-scoped-environment.adr.md`, `32-git-worktree.enabler/21-git-worktree-shape.adr.md`), `spx/13-cli.enabler/15-cli-architecture.adr.md`, and `spx/17-language-detection.enabler/21-detection-approach.adr.md`.

Migration method (apply each batch): rewrite each record decision-first — decision as opening prose (no `## Purpose` / `## Context` / `## Decision` heading), `## Rationale`, optional `## Invariants` (ADR) / `## Product properties` (PDR), and `## Verification`. Map each legacy `[review]` rule to `### Audit` `([audit])`; map a rule already carrying a `[test](path)` link to `### Testing` with the evidence type from its filename. Preserve every concrete contract enumeration verbatim in the opening — env-field and helper lists, signatures, named definitions — because condensing them away reads as content-loss the CI reviewer flags. Update this "Migrated so far" list in the same commit as the migration.

Legacy markers to migrate: the verbose ADR/PDR form (`## Purpose` / `## Context` / a `## Decision` heading / `## Trade-offs` / a `## Compliance` block with `### MUST` / `### NEVER` / `([review])` tags) and the PDR-specific `## Product invariants` heading (canonical: `## Product properties`). Re-grep the tree for these markers before each batch — the lists below are not exhaustive.

- Verbose ADRs include `spx/23-spec-tree.enabler/21-kind-registry.adr.md` and the `spx/41-validation.enabler/**` ADRs.
- PDRs still carrying `## Product invariants`: `spx/17-file-inclusion.enabler/11-ignore-defaults.pdr.md`, `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md`, `spx/36-session.enabler/11-session-frontmatter.pdr.md`, `spx/41-validation.enabler/11-tool-based-validation.pdr.md`, and `spx/36-audit.enabler/11-audit-scope.pdr.md`.

Separate follow-up — spec-assertion `[review]` tags: many node spec files (`{slug}.md`) carry `[review]` evidence tags on `## Assertions`, the retired legacy spelling of `[audit]`. This is distinct from the decision-record template migration above and tree-wide; `spx/16-config.enabler/21-config-cli.enabler/config-cli.md` is one surfaced example. Migrate spec-assertion `[review]` → `[audit]` as its own pass (re-grep `spx/**/*.md` excluding `*.adr.md` / `*.pdr.md` for `[review]`).

## Canonical ADR template orders Verification subsections Audit-first

The canonical ADR template (`plugins/spec-tree/skills/understanding/templates/decisions/decision-name.adr.md`) and `typescript:standardizing-typescript-architecture` list the `## Verification` subsections `### Audit` → `### Eval` → `### Testing`, while the PDR template orders them `### Testing` → `### Eval` → `### Audit` by decreasing enforcement strength, and the existing ADR corpus follows the PDR's Testing-first order. By operator decision, spx orders both record types Testing-first (decreasing enforcement strength); the ADR template's Audit-first listing is the upstream inconsistency.

**Owner:** the fix is in `~/Code/outcomeeng/plugins` (the spec-tree plugin's canonical ADR template and the typescript architecting skill) — a separate product. Reorder the ADR template's `## Verification` subsections to `### Testing` → `### Eval` → `### Audit`. Until then, author spx ADRs Testing-first per `CLAUDE.md`.
