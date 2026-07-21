# Read-Set Projection

PROVIDES the structural context walk for a resolved target — the read-class and listed-class entry model over product, ancestor, target, decision, sibling, coordination, guide, and overlay documents
SO THAT the citation, content, methodology, and composition projections under `spx/31-spec-domain.enabler/43-context-ingestion.enabler`
CAN consume one complete, deterministically ordered read set per target without re-deriving tree structure or entry classification

## Assertions

### Mappings

- Manifest entries map roles to entry classes: `product`, `ancestor`, `target`, `decision`, `lower-index-sibling`, `coordination`, `cited-decision`, and `lifecycle-overlay` entries form the read class in that group order, and `evidence`, `guide`, `overlay`, `same-index-sibling`, and `higher-index-sibling` entries form the listed class carrying no read obligation ([test](tests/context-manifest.mapping.l1.test.ts))

### Scenarios

- Given a read-eligible path is a symbolic link whose canonical target lies outside the product directory, when the manifest is built, then the path binds no entry and the target's bytes are never emitted ([test](tests/read-set.scenario.l1.test.ts))
- Given coordination notes exist at the product root, at an ancestor, and at the target, when the manifest is built, then each note appears as a `coordination` read entry in walk order ([test](tests/read-set.scenario.l1.test.ts))
- Given runtime guide files exist at the product root and in node directories along the target path, when the manifest is built, then each guide appears as a listed `guide` entry carrying no read obligation, no content, no digest, and no byte count ([test](tests/read-set.scenario.l1.test.ts))
- Given local overlays exist, when the manifest is built, then the lifecycle overlay appears as a `lifecycle-overlay` read entry and every other overlay appears as a listed `overlay` entry ([test](tests/read-set.scenario.l1.test.ts))
