# Plan: Context Ingestion

## Purpose

Add the deterministic context-ingestion surface that replaces skill-only contextualizing for repeatable local execution.

## Governing Specs

- `spx/spx.product.md`
- `spx/31-spec-domain.enabler/spec-domain.md`
- `spx/23-spec-tree.enabler/spec-tree.md`
- `spx/15-worktree-resolution.pdr.md`

## Implementation Notes

- Build on the public spec-tree surface rather than parsing directories in command code.
- Return both human-readable and machine-readable context output when the spec CLI output mode requests each format.
- Preserve the methodology ordering rules: lower-index siblings constrain; same-index peers are independent; higher-index siblings do not constrain.
- Include PLAN.md and ISSUES.md as escape-hatch context, not product truth.
- Never truncate context silently; if a transport or display boundary cannot carry the complete manifest, return an explicit incomplete-context diagnostic for the affected output mode.

## Evidence Required

- Scenario tests cover root target, nested target, same-index peers, lower-index siblings, and missing target errors.
- Mapping tests cover manifest fields and output formats.
- Compliance tests prove command modules use the spec-tree public surface and do not parse suffixes directly.

## Parallelization

This can proceed independently from config-backed testing and audit once the branch starts from the merged spec-tree public surface.

## Agent Pickup Prompt

```text
Before branching, follow the common packet rules in `spx/16-config.enabler/PLAN.md`, including the branch-existence guard and settled-prerequisite checks.

Start from fresh origin/main on work/context-ingestion. Invoke spec-tree:understanding if needed, then spec-tree:contextualizing for spx/31-spec-domain.enabler/43-context-ingestion.enabler/. Read this PLAN and the governing specs it names. Invoke spec-tree:applying, spec-tree:testing, typescript:testing-typescript, and typescript:coding-typescript before edits.

Before branching, verify `git ls-tree origin/main -- spx/31-spec-domain.enabler/spec-domain.md` and `git ls-tree origin/main -- spx/23-spec-tree.enabler/spec-tree.md` report the settled public surfaces. Build deterministic context ingestion on the public spec-tree surface. Return complete machine-readable and human-readable manifests for product root and nested targets. Preserve ordering rules: lower-index siblings constrain, same-index siblings are independent, and higher-index siblings are listed without being read as constraints. Include PLAN.md and ISSUES.md as escape-hatch context. Prove root target, nested target, same-index peers, lower-index siblings, missing target errors, manifest fields, output formats, and no suffix parsing in command modules. Open one PR and ask reviewers to audit completeness and deterministic context boundaries.
```
