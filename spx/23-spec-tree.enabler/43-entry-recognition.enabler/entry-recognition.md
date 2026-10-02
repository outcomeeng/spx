# Entry Recognition

PROVIDES grammar-backed, version-aware recognition of spec-tree product files, node directories, decision files, and co-located evidence files — classifying each name against the versioned filename grammar
SO THAT source adapters for filesystems, issue trackers, ORMs, and paper-ledger transcriptions
CAN convert raw backend records into typed source entries tagged valid, superseded, or invalid, without owning grammar vocabulary or knowing prior naming-schema versions themselves

## Assertions

- ALWAYS: while `methodology.migratingFrom` is declared, a node directory named in either the target or the migration-source naming-schema version classifies valid and is traversed

### Mappings

- `{NN}-{slug}{nodeSuffix}` directory names map to node kind, order, and slug when `nodeSuffix` belongs to a node kind of a declaration-selected naming-schema version ([test](tests/entry-recognition.mapping.l1.test.ts))
- `{NN}-{slug}{decisionSuffix}` filenames map to decision kind, order, and slug when `decisionSuffix` belongs to a registered decision kind ([test](tests/entry-recognition.mapping.l1.test.ts))
- Under the 3.x naming-schema version, `spx/{name}.product.md` maps to the product entry; under the 4.0 version, a `spx/{name}.spec.md` directly under `spx/` declaring `kind: product` maps to the product entry; each product entry carries the title `{name}` its filename names ([test](tests/entry-recognition.mapping.l1.test.ts))

### Properties

- Every filename under a `tests/` directory whose form matches a declaration-selected naming-schema version's evidence-naming form maps to an evidence entry ([test](tests/evidence-recognition.property.l1.test.ts))
- Every name valid under the declaration-selected naming-schema versions maps to a valid entry of its kind ([test](tests/version-classification.property.l1.test.ts))
- Every name matching a naming-schema version ordered before the declared target's, but not valid under the declaration-selected versions, maps to a superseded entry that names the newest such version it matched ([test](tests/version-classification.property.l1.test.ts))
- Every name neither valid under the declaration-selected versions nor matching a version ordered before the declared target's maps to an invalid entry ([test](tests/version-classification.property.l1.test.ts))

### Compliance

- ALWAYS: recognition derives categories, suffixes, labels, and accepted naming forms from the versioned grammar exposed by `spx/23-spec-tree.enabler/29-filename-grammar.enabler` ([test](tests/entry-recognition.mapping.l1.test.ts))
- NEVER: recognition hardcodes a suffix or evidence-naming form, or branches on a prior naming form outside the ordered naming-schema versions — prior-version recognition derives from the grammar's schema set ([test](tests/version-classification.compliance.l1.test.ts))
