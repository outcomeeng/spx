---
malleability: spec
---

# Read-Set Projection

PROVIDES deterministic structural selection for context manifests and document projections
SO THAT context renderers and multi-target composition
CAN derive complete targetless and targeted entry sets without filesystem heuristics or agent judgment

## Assertions

- Each `list` entry's projection mode is the highest mode its selections require, ordered `full` over `digest` over `reference`.

### Scenarios

- Given a tree with no product spec, no nodes, and no root decisions, when its projection is computed, then it selects nothing ([test](tests/read-set.scenario.l1.test.ts))
- Given no target, when `show` projects the Product Tree, then it renders the product spec in Full, node specs at depths 1 and 2 in Digest, decisions directly contained at depths 0 through 2 in Digest, and existing `ISSUES.md` files at those depths as path-only references ([test](tests/read-set.scenario.l1.test.ts))
- Given one or more explicit targets, when the targeted projection is computed, then it renders each explicit target and ancestor spec in Full, every sibling spec along each target path and every immediate child of an explicit target in Digest, all decisions directly contained by explicit targets in Full, and, at each ancestor along each target path, every directly contained decision whose index is below the index of the child through which that path continues in Full ([test](tests/read-set.scenario.l1.test.ts))
- Given an explicit product-root target, when its projection is computed, then it renders the product in Full, its decisions in Full, its immediate children in Digest, and its knowledge-index reference, intentionally differing from targetless discovery ([test](tests/read-set.scenario.l1.test.ts))

### Mappings

- Every entry `show` selects for a set of targets maps to exactly one `list` entry for the same targets. ([test](tests/context-manifest.mapping.l1.test.ts))
- For each requested target that selects an entry, `list` records the first selection reason that applies in the precedence `spx/31-spec-domain.enabler/43-context-ingestion.enabler/32-context-manifest-schema.pdr.md` declares, and each reason requires one projection mode: `target` — an explicit target's spec and its directly contained decisions, the product spec and root decisions of an explicit product-root target included — requires `full`; `product` — the product spec and the decisions selected directly under the product root — requires `full`; `ancestor` — ancestor specs and the decisions selected at each ancestor — requires `full`; `sibling` — sibling specs along each target path — requires `digest`; `immediate-child` — an explicit target's immediate children, the top-level nodes of an explicit product-root target included — requires `digest`; `outcome-record` — an explicit target's outcome record — requires `full`; `knowledge-index` — its `knowledge/index.md` — requires `reference`; `cited-decision` — a decision a selected document cites — requires `full`; and `issue` — an `ISSUES.md` on a target path — requires `reference`. ([test](tests/context-manifest.mapping.l1.test.ts))

### Compliance

- ALWAYS: a tree holding nodes or root decisions without a product spec fails every targeted and targetless selection with the missing-product-spec failure ([test](tests/read-set.compliance.l1.test.ts))
- NEVER: `list` carries an entry for a document `show` does not select, `PLAN.md` included ([test](tests/context-manifest.compliance.l1.test.ts))
- ALWAYS: an explicitly targeted node contributes its outcome record in Full when present ([test](tests/read-set.compliance.l1.test.ts))
- ALWAYS: an explicitly targeted node contributes its `knowledge/index.md` as a path-only reference when present ([test](tests/read-set.compliance.l1.test.ts))
- NEVER: an implicit ancestor, sibling, or child contributes its outcome record or its `knowledge/index.md` ([test](tests/read-set.compliance.l1.test.ts))
- ALWAYS: `show` delivers every existing `ISSUES.md` on a target path as a path-only reference ([test](tests/read-set.compliance.l1.test.ts))
- NEVER: `show` includes an issue body, heading, excerpt, or count ([test](tests/read-set.compliance.l1.test.ts))
- ALWAYS: `list` names every existing `ISSUES.md` on a target path ([test](tests/context-manifest.compliance.l1.test.ts))
- NEVER: `list` includes an issue body, heading, excerpt, or count ([test](tests/context-manifest.compliance.l1.test.ts))
- ALWAYS: an agent reads each referenced `ISSUES.md` on an explicit target path before working on that target ([audit])
- ALWAYS: evidence under `tests/`, `evals/`, and `probes/`, harness guides, overlays under `spx/local/`, and every unselected file class remain outside `show` ([test](tests/read-set.compliance.l1.test.ts))
- ALWAYS: evidence under `tests/`, `evals/`, and `probes/`, harness guides, overlays under `spx/local/`, and every unselected file class remain outside `list` ([test](tests/context-manifest.compliance.l1.test.ts))
- ALWAYS: `show` orders selected tree entries depth-first by numeric index with ordinal comparison of the complete directory-entry name as the equal-index tie-break ([test](tests/read-set.compliance.l1.test.ts))
- ALWAYS: `list` orders selected tree entries depth-first by numeric index with ordinal comparison of the complete directory-entry name as the equal-index tie-break ([test](tests/context-manifest.compliance.l1.test.ts))
