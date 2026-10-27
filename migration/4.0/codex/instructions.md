# Methodology 4.0 migration instructions

The target is methodology 4.0 as the `understand` skill defines it: node kinds named by directory suffix, one `{slug}.spec.md` per node, decision records inside the node whose subtree they govern, tree-absolute links, and a machine-written `spx.status.json` per output node.

## Steps

1. Load the foundation with the `understand` skill. Its truth hierarchy governs every step: decisions, then specs, then evidence, then code.
2. Convert decision citations to tree-absolute Markdown links with the `migrate-3-to-4` skill. Resolve each citation the conversion reports as unconvertible with the operator; never guess a target.
3. For each node, classify its kind with the ordered procedure in the foundation's `references/kind-decision.md`, and rename the directory suffix, the spec file, and the node's front matter to the 4.0 grammar in `references/grammar.md`. Rename with `git mv`.
4. Rewrite each spec so it states atemporal product truth: the type opening for its kind, then `## Assertions`, each assertion carrying one verification tag. Move any workflow or history prose into a Change, `ISSUES.md`, or the knowledge root named in the foundation.
5. Replace each `PLAN.md` with a Change authored through the `author-change` skill, then remove the note.
6. Set `methodology.version` to the target version in `spx.config.yaml` and remove `methodology.migratingFrom`.
7. Regenerate the managed instruction markers in the product's `AGENTS.md` with the `update-instruction-block` skill, so they carry the template version the shipped target records.
8. Verify the migrated tree with the product's validation command and record the result in the migration's verification run.

## Constraints

- Never mechanically rewrite product truth under `spx/` beyond the steps above; semantic decisions belong to this migration, made against the 4.0 foundation.
- Never edit `spx.status.json` by hand; the product's projector writes it.
- Never leave the migration half-complete without reporting which step stopped and why.
