# Context Ingestion

PROVIDES deterministic spec-tree context ingestion for CLI consumers
SO THAT agents and developers requesting work context
CAN receive the complete read set for a node — methodology identity, product root, bootstrap state, schema version, specs, decisions with citing-file provenance, coordination notes, runtime guides, and local overlays — and, on request, every read document's exact content in one machine-readable response without LLM inference

## Assertions

### Mappings

- Context target forms map to resolution outcomes as follows: canonical node paths, paths with an optional leading `spx/`, paths with trailing separators, and paths whose node-directory segments uniquely prefix one sibling resolve to the canonical full node path; unknown segments identify the unresolved input; ambiguous segments identify every matching sibling; node-owned artifact paths identify their owning node without selecting it; and product-root artifact paths — the product spec and root decisions — direct the caller to choose a node whose context includes the artifact ([test](tests/context-target-resolution.mapping.l1.test.ts))
- Manifest entries map roles to entry classes: `product`, `ancestor`, `target`, `decision`, `lower-index-sibling`, `coordination`, `guide`, `cited-decision`, and `lifecycle-overlay` entries form the read class in that group order, and `evidence`, `overlay`, `same-index-sibling`, and `higher-index-sibling` entries form the listed class carrying no read obligation ([test](tests/context-manifest.mapping.l1.test.ts))

### Scenarios

- Given a read-class spec or decision cites a full-path decision absent from the structural context, when the manifest is built, then the cited decision appears exactly once as a `cited-decision` read entry carrying every citing document path, including citations discovered transitively inside cited decisions ([test](tests/cited-decisions.scenario.l1.test.ts))
- Given a read-class spec or decision cites a full-path decision that no tracked file satisfies, when the manifest is built, then the command fails naming the cited path and the citing document ([test](tests/cited-decisions.scenario.l1.test.ts))
- Given a read-class document contains a citation-shaped path carrying a relative path segment, when the manifest is built, then the path binds no read entry, reaches no filesystem probe, and the command succeeds ([test](tests/cited-decisions.scenario.l1.test.ts))
- Given a read-eligible path is a symbolic link whose canonical target lies outside the product directory, when the manifest is built, then the path binds no entry and the target's bytes are never emitted ([test](tests/read-set.scenario.l1.test.ts))
- Given coordination notes exist at the product root, at an ancestor, and at the target, when the manifest is built, then each note appears as a `coordination` read entry in walk order ([test](tests/read-set.scenario.l1.test.ts))
- Given runtime guide files exist at the product root and in node directories along the target path, when the manifest is built, then each guide appears as a `guide` read entry ([test](tests/read-set.scenario.l1.test.ts))
- Given local overlays exist, when the manifest is built, then the lifecycle overlay appears as a `lifecycle-overlay` read entry and every other overlay appears as a listed `overlay` entry ([test](tests/read-set.scenario.l1.test.ts))
- Given the machine output mode requests document content, when the manifest is built, then every read entry carries the document's exact UTF-8 content, its raw-byte digest naming the hash algorithm, and its byte count, and no listed entry carries content, digest, or byte count ([test](tests/content.scenario.l1.test.ts))
- Given a read document whose bytes are not valid UTF-8, when document content is requested, then the command fails naming the exact document path ([test](tests/content.scenario.l1.test.ts))
- Given a read document that cannot be read, when document content is requested, then the command fails naming the exact document path ([test](tests/content.scenario.l1.test.ts))
- Given the machine output mode does not request document content, when the manifest is built, then no entry carries content, digest, or byte count ([test](tests/content.scenario.l1.test.ts))

### Properties

- The projection is deterministic: identical tracked tree content produces byte-identical machine output across repeated runs, with and without document content ([test](tests/determinism.property.l1.test.ts))

### Compliance

- ALWAYS: context ingestion reads tracked `spx/` files from the worktree-local product directory ([test](tests/context-ingestion.compliance.l1.test.ts))
- NEVER: target resolution selects the first ambiguous sibling, lets a matching descendant disambiguate an ambiguous ancestor, or treats a canonical segment as ambiguous when another valid sibling segment begins with it ([test](tests/context-ingestion.compliance.l1.test.ts))
- ALWAYS: the machine manifest carries the manifest schema version and the snapshot-derived bootstrap flag ([test](tests/context-ingestion.compliance.l1.test.ts))
- ALWAYS: context ingestion exposes machine-readable manifest output for automation and human-readable output for terminal inspection when the requested output mode names each format ([test](tests/context-ingestion.compliance.l1.test.ts))
- ALWAYS: configured methodology source and version are read from the top-level `methodology` config descriptor ([test](tests/context-ingestion.compliance.l1.test.ts))
- NEVER: select context by keyword search, semantic similarity, or LLM judgment ([audit])
