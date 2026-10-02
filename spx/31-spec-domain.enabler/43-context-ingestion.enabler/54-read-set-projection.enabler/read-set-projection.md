---
malleability: spec
---

# Read-Set Projection

PROVIDES deterministic structural selection for context manifests and document projections
SO THAT context renderers and multi-target composition
CAN derive complete targetless and targeted entry sets without filesystem heuristics or agent judgment

## Assertions

- A tree with no product spec, no nodes and no root decisions selects nothing; a tree holding nodes or root decisions without a product spec fails every targeted and targetless selection with the missing-product-spec failure.

### Scenarios

- Given no target, when `show` projects the Product Tree, then it renders the product spec in Full, node specs at depths 1 and 2 in Digest, decisions directly contained at depths 0 through 2 in Digest, and existing `ISSUES.md` files at those depths as path-only references ([test](tests/read-set.scenario.l1.test.ts))
- Given one or more explicit targets, when the targeted projection is computed, then it renders each explicit target and ancestor spec in Full, every sibling spec along each target path and every immediate child of an explicit target in Digest, all decisions directly contained by explicit targets in Full, and, at each ancestor along each target path, every directly contained decision whose index is below the index of the child through which that path continues in Full ([test](tests/read-set.scenario.l1.test.ts))
- Given an explicit product-root target, when its projection is computed, then it renders the product in Full, its decisions in Full, its immediate children in Digest, and its knowledge-index reference, intentionally differing from targetless discovery ([test](tests/read-set.scenario.l1.test.ts))

### Mappings

- `list` and `show` select one entry set for the same targets: every entry `show` selects carries a `list` role naming how `show` selects it — Full, Digest, or path-only reference — so an explicit target's outcome record, its `knowledge/index.md`, its immediate children, and every sibling at each level along each target path each carry a role, the top-level nodes of an explicit product-root target carry the immediate-child role, and `list` carries no role for any entry `show` does not select, `PLAN.md` included, over the complete declared role domain. ([test](tests/context-manifest.mapping.l1.test.ts))

### Compliance

- ALWAYS: an explicitly targeted node contributes its outcome record in Full and its `knowledge/index.md` as a path-only reference when present; implicit ancestors, siblings, and children contribute neither ([test](tests/read-set.compliance.l1.test.ts))
- ALWAYS: existing `ISSUES.md` files on target paths contribute path-only references, and spec context output never includes issue bodies, headings, excerpts, or counts ([test](tests/read-set.compliance.l1.test.ts), [test](tests/context-manifest.compliance.l1.test.ts))
- ALWAYS: evidence under `tests/`, `evals/`, and `probes/`, runtime guides, overlays under `spx/local/`, and every unselected file class remain outside `list` and `show` ([test](tests/read-set.compliance.l1.test.ts), [test](tests/context-manifest.compliance.l1.test.ts))
- ALWAYS: selected tree entries use depth-first numeric-index order with ordinal comparison of the complete directory-entry name as the equal-index tie-break ([test](tests/read-set.compliance.l1.test.ts), [test](tests/context-manifest.compliance.l1.test.ts))
