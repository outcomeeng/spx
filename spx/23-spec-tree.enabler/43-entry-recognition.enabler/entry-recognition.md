# Entry Recognition

PROVIDES grammar-backed, version-aware recognition of spec-tree product files, node directories, decision files, and co-located evidence files — classifying each name against the versioned filename grammar
SO THAT source adapters for filesystems, issue trackers, ORMs, and paper-ledger transcriptions
CAN convert raw backend records into typed source entries tagged valid, superseded, or invalid, without owning grammar vocabulary or knowing prior naming-schema versions themselves

## Assertions

### Mappings

- `{NN}-{slug}{nodeSuffix}` directory names map to node kind, order, and slug when `nodeSuffix` belongs to a registered node kind ([test](tests/entry-recognition.mapping.l1.test.ts))
- `{NN}-{slug}{decisionSuffix}` filenames map to decision kind, order, and slug when `decisionSuffix` belongs to a registered decision kind ([test](tests/entry-recognition.mapping.l1.test.ts))
- Product filenames ending in `.product.md` map to product entries with the product title derived from the filename slug ([test](tests/entry-recognition.mapping.l1.test.ts))
- Filenames under a `tests/` directory whose form matches the canonical evidence-naming schema map to evidence entries ([test](tests/evidence-recognition.mapping.l1.test.ts))

### Properties

- Every name matching the canonical naming-schema version maps to a valid entry of its kind ([test](tests/version-classification.property.l1.test.ts))
- Every name matching a prior naming-schema version, but not the canonical one, maps to a superseded entry that names the version it matched ([test](tests/version-classification.property.l1.test.ts))
- Every name matching no naming-schema version maps to an invalid entry ([test](tests/version-classification.property.l1.test.ts))

### Compliance

- ALWAYS: recognition derives categories, suffixes, labels, and accepted naming forms from the versioned grammar exposed by `spx/23-spec-tree.enabler/29-filename-grammar.enabler` ([test](tests/entry-recognition.mapping.l1.test.ts))
- NEVER: recognition hardcodes a suffix or evidence-naming form, or branches on a prior naming form outside the ordered naming-schema versions — prior-version recognition derives from the grammar's schema set ([test](tests/version-classification.compliance.l1.test.ts))
