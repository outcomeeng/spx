# Known Issues: 23-spec-tree.enabler

Both entries were discovered while authoring `26-filename-grammar.adr.md`. They are broader than this node; recorded here because the filename-grammar work lives here. Tracked, not blocking.

## ADR template: the TypeScript architecting skills diverge from the canonical template

`typescript:standardizing-typescript-architecture` and `typescript:architecting-typescript` describe an ADR template — `## Purpose` / `## Context` / `## Decision` / `## Rationale` / `## Trade-offs` / `## Invariants` / `## Compliance` with `([review])` tags — that contradicts the canonical `/understanding` template they claim to derive from: decision-first (no `## Purpose` heading), `## Rationale`, `## Invariants`, `## Verification` with `### Audit` / `### Eval` / `### Testing` carrying `([audit])` / `([eval])` / evidence-type tags. `spec-tree:audit-adr` audits against the canonical template, so an ADR authored to the TypeScript skills' described template rejects on section structure and tag validity.

**Owner:** the fix is in `~/Code/outcomeeng/plugins` (the typescript plugin skill sources) — a separate product. Until then, author TypeScript ADRs to the canonical decision-first/Verification template directly, not the template the TypeScript skills describe.

## spx ADR corpus predates the canonical template

The existing spx ADRs (`spx/14-cli-composition.adr.md`, `spx/19-language-registration.adr.md`, `spx/23-spec-tree.enabler/21-kind-registry.adr.md`, and the `spx/41-validation.enabler/**` ADRs) use the old `## Purpose` / `## Compliance` / `### MUST` / `### NEVER` / `([review])` template. `26-filename-grammar.adr.md` is the first authored to the canonical decision-first/Verification template. Migrating the corpus is a deliberate, separate pass — not a blocker for the filename-grammar work.
