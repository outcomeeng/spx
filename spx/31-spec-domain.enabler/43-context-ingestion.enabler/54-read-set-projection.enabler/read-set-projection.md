# Read-Set Projection

PROVIDES deterministic structural selection for context manifests and document projections
SO THAT context renderers and multi-target composition
CAN derive complete targetless and targeted entry sets without filesystem heuristics or agent judgment

## Assertions

### Mappings

- Targetless `show` renders the product spec in Full, node specs at depths 1 and 2 in Digest, decisions directly contained at depths 0 through 2 in Digest, and existing `ISSUES.md` files at those depths as path-only references ([test](tests/context-manifest.mapping.l1.test.ts))
- A targeted projection renders each explicit target and ancestor spec in Full, every sibling spec along each target path and every immediate child of an explicit target in Digest, and all decisions directly contained by explicit targets and their ancestors in Full ([test](tests/context-manifest.mapping.l1.test.ts))
- An explicit product-root target renders the product in Full, its decisions in Full, its immediate children in Digest, and its knowledge-index reference; it intentionally differs from targetless discovery ([test](tests/context-manifest.mapping.l1.test.ts))
- An explicitly targeted node contributes its outcome record in Full and its `knowledge/index.md` as a path-only reference when present; implicit ancestors, siblings, and children contribute neither ([test](tests/context-manifest.mapping.l1.test.ts))
- Existing `ISSUES.md` files on target paths contribute path-only references; spec context output never includes issue bodies, headings, excerpts, or counts ([test](tests/context-manifest.mapping.l1.test.ts))
- Evidence under `tests/`, `evals/`, and `probes/`, runtime guides, non-lifecycle overlays, and every unselected file class remain outside `show` ([test](tests/context-manifest.mapping.l1.test.ts))
- Selected tree entries use depth-first numeric-index order with ordinal comparison of the complete directory-entry name as the equal-index tie-break ([test](tests/context-manifest.mapping.l1.test.ts))
