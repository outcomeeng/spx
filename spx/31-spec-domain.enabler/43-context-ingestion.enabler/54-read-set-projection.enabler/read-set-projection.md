---
malleability: spec
---

# Read-Set Projection

PROVIDES deterministic structural selection for context manifests and document projections
SO THAT context renderers and multi-target composition
CAN derive complete targetless and targeted entry sets without filesystem heuristics or agent judgment

## Assertions

- ALWAYS: a tree holding nodes or root decisions without a product spec fails every targeted and targetless selection with the missing-product-spec failure
- NEVER: `list` carries an entry for a document `show` does not select, `PLAN.md` included
- ALWAYS: an explicitly targeted node contributes its outcome record in Full when present
- ALWAYS: an explicitly targeted node contributes its `knowledge/index.md` as a path-only reference when present
- NEVER: an implicit ancestor, sibling, or child contributes its outcome record or its `knowledge/index.md`
- ALWAYS: `show` delivers every existing `ISSUES.md` on a target path as a path-only reference
- NEVER: `show` includes an issue body, heading, excerpt, or count
- ALWAYS: `list` names every existing `ISSUES.md` on a target path
- NEVER: `list` includes an issue body, heading, excerpt, or count
- ALWAYS: evidence under `tests/`, `evals/`, and `probes/`, harness guides, overlays under `spx/local/`, and every unselected file class remain outside `show`
- ALWAYS: evidence under `tests/`, `evals/`, and `probes/`, harness guides, overlays under `spx/local/`, and every unselected file class remain outside `list`
- ALWAYS: `show` orders selected tree entries by one depth-first walk from the product root in which each walked directory, the product root or a node, contributes in this order its own spec, the product spec at the product root, then its `ISSUES.md` reference, then its outcome record, then its `knowledge/index.md` reference, each where selected, and then its selected decisions and selected child nodes merged into one sequence in ascending numeric index, each child node walked completely at its position before the next entry of that sequence, with ordinal comparison of the complete directory-entry name, a decision's filename and a child node's directory name alike, as the equal-index tie-break
- ALWAYS: `list` orders selected tree entries by one depth-first walk from the product root in which each walked directory, the product root or a node, contributes in this order its own spec, the product spec at the product root, then its `ISSUES.md` reference, then its outcome record, then its `knowledge/index.md` reference, each where selected, and then its selected decisions and selected child nodes merged into one sequence in ascending numeric index, each child node walked completely at its position before the next entry of that sequence, with ordinal comparison of the complete directory-entry name, a decision's filename and a child node's directory name alike, as the equal-index tie-break
- Given a tree with no product spec, no nodes, and no root decisions, when its projection is computed, then it selects nothing
- Given no target, when `show` projects the Product Tree, then it renders the product spec in Full, node specs at depths 1 and 2 in Digest, decisions directly contained at depths 0 through 2 in Digest, and existing `ISSUES.md` files at those depths as path-only references
- Given one or more explicit targets, when the targeted projection is computed, then it renders each explicit target and ancestor spec in Full, every sibling spec along each target path and every immediate child of an explicit target in Digest, all decisions directly contained by explicit targets in Full, and, at each ancestor along each target path, every directly contained decision whose index is below the index of the child through which that path continues in Full
- Given an explicit product-root target, when its projection is computed, then it renders the product in Full, its decisions in Full, its immediate children in Digest, and its knowledge-index reference, intentionally differing from targetless discovery
- Every entry `show` selects for a set of targets maps to exactly one `list` entry for the same targets.
- Each `list` entry's projection mode is the highest mode its selections require, ordered `full` over `digest` over `reference`.
- For each requested target that selects an entry, `list` records the first selection reason that applies in the precedence [spx/31-spec-domain.enabler/43-context-ingestion.enabler/32-context-manifest-schema.pdr.md](spx/31-spec-domain.enabler/43-context-ingestion.enabler/32-context-manifest-schema.pdr.md) declares, and each reason requires one projection mode: `target` — an explicit target's spec and its directly contained decisions, the product spec and root decisions of an explicit product-root target included — requires `full`; `product` — the product spec and the decisions selected directly under the product root — requires `full`; `ancestor` — ancestor specs and the decisions selected at each ancestor — requires `full`; `sibling` — sibling specs along each target path — requires `digest`; `immediate-child` — an explicit target's immediate children, the top-level nodes of an explicit product-root target included — requires `digest`; `outcome-record` — an explicit target's outcome record — requires `full`; `knowledge-index` — its `knowledge/index.md` — requires `reference`; `cited-decision` — a decision a selected document cites — requires `full`; and `issue` — an `ISSUES.md` on a target path — requires `reference`.

### Compliance

- ALWAYS: an agent reads each referenced `ISSUES.md` on an explicit target path before working on that target ([audit])
