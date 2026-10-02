# Recognition Classification Result

The recognizer classifies every ordered `{NN}-{slug}{suffix}` directory and every product-root name against the naming-schema versions and the selection a methodology declaration derives: a name is valid when a version the declaration selects accepts it, superseded — carrying the newest matching version — when only a version ordered before the declared target's accepts it, and invalid when an ordered directory matches neither, while decision and evidence files matching a selected version's form classify valid and a record attempting no recognized form yields no entry. A valid node directory's spec file resolves through the spec-file form of the version that classified it, and while `methodology.migratingFrom` is declared a node directory named in either the target or the migration-source version classifies valid and is traversed, with no containment check between a node of one version and a node of the other. Superseded and invalid join the spec-tree source-entry union alongside product, node, decision, and evidence, so one entry stream partitions into the valid tree, the superseded list, and the invalid residual. The recognizer reads the naming-schema versions and the selection as parameters the source supplies, directory descent follows only valid node entries, and the snapshot carries the superseded entries and invalid residual distinct from the assembled valid tree — refining [`spx/23-spec-tree.enabler/26-filename-grammar.adr.md`](../26-filename-grammar.adr.md) and [`spx/23-spec-tree.enabler/29-filename-grammar.enabler/21-versioned-grammar-model.adr.md`](../29-filename-grammar.enabler/21-versioned-grammar-model.adr.md).

## Rationale

An ordered `{NN}-{slug}{suffix}` directory is an attempt at a node, so a suffix matching no selected or earlier form is a real account of a non-conforming attempt rather than an absence: the recognizer retains it as an invalid entry rather than dropping it to null. Dropping the attempt forces a second traversal to recover the residual; classifying it makes the invalid set the complement of recognition over the node attempts in one pass, the residual-retention property [`spx/23-spec-tree.enabler/26-filename-grammar.adr.md`](../26-filename-grammar.adr.md) requires. A record that attempts no recognized form — a node's own spec file, a coordination note, an unrelated file — is content within the tree, not a node attempt, so it yields no entry and never enters the residual; widening the residual to every visited name would bury non-conforming attempts under ordinary content.

Versioning covers node-directory suffixes, the spec-file form, and the product-root form, because the 4.0 line changes all three while decision and evidence forms stay fixed across the versions spx reads. Scoping the invalid residual to ordered directories keeps a node's spec file — whose slug can begin with digits — from being mistaken for an ordered attempt. Each name classifies by its own version because the product's agent capability lifecycle makes an artifact at either the target or the migration source resolve without failing on version shape alone, so a migrating tree's mixed nesting is a valid state the recognizer traverses rather than a defect it reports. Source entries discriminate by a `type` field, so superseded and invalid join that union as two further types; one entry stream then partitions into the valid tree, the superseded list, and the residual without a parallel channel or a separate scanner.

The versions and the selection are parameters so classification is verified by passing naming-schema-version fixtures with no mocking, per [`spx/23-spec-tree.enabler/26-filename-grammar.adr.md`](../26-filename-grammar.adr.md); the filesystem source supplies the library's owned versions and the selection its product directory's declaration derives, so production readers pass only the source. Descent follows only valid node entries because a superseded or invalid ordered directory is not a valid node, so its descendants are not part of the valid tree — emitting recognized descendants below such a directory is the case the source spec forbids. Carrying superseded and invalid as snapshot fields distinct from the valid tree lets traversal, state derivation, and projection read the valid tree while a consumer auditing names reads the superseded and residual fields; folding the residual into the valid node list would force every tree consumer to filter non-valid entries at each call site.

## Invariants

- Every ordered `{NN}-{slug}{suffix}` directory classifies as exactly one of valid, superseded, or invalid; such an attempt is never dropped.
- A node directory classifies valid when a declaration-selected version accepts its suffix, superseded when only a version ordered before the declared target's accepts it, and invalid when neither does.
- The valid tree, the superseded list, and the invalid residual partition the classified entries: each appears in exactly one.
- A superseded entry carries the newest naming-schema version it matched.
- A record's classification is a function of the injected naming-schema versions, the declaration's selection, and the record alone.

## Verification

- ALWAYS: under a 3.x selection, `spx/{name}.product.md` classifies as the product entry, and under a 4.0 selection, `spx/{name}.spec.md` directly under `spx/` classifies as the product entry
- ALWAYS: a valid node directory's spec file resolves through the spec-file form of the version that classified that directory
- ALWAYS: while `methodology.migratingFrom` is declared, a node directory named in either the target or the migration-source naming-schema version classifies valid and is traversed
- NEVER: recognition checks containment between a node of one naming-schema version and a node of another

### Testing

- ALWAYS: every product file, evidence file, decision file, and ordered `{NN}-{slug}{suffix}` directory maps to a classified source entry — valid (product, node, decision, or evidence), superseded (a product or node carrying the matched version), or invalid (a node) ([mapping])
- ALWAYS: the valid tree, the superseded list, and the invalid residual partition the classified ordered directories — each appears in exactly one ([compliance])
- ALWAYS: a record's classification follows the injected naming-schema versions and selection — a suffix the injected selection leaves only to a version ordered before the declared target's classifies superseded, and a suffix a selected version accepts with no backing registry kind classifies invalid ([mapping])
- ALWAYS: directory descent follows only valid node entries; superseded and invalid ordered directories are not traversed ([mapping])
- ALWAYS: the snapshot carries the superseded entries and the invalid residual as fields distinct from the assembled valid tree ([compliance])
- NEVER: an ordered `{NN}-{slug}{suffix}` directory is dropped — a suffix matching neither a selected nor an earlier version is retained as an invalid entry, not silently skipped ([mapping])

### Audit

- ALWAYS: superseded and invalid are members of the source-entry union, so one entry stream carries every classification without a parallel channel or a separate scanner ([audit])
- ALWAYS: the recognizer accepts the naming-schema versions and the selection a methodology declaration derives as parameters, which the source supplies ([audit])
- NEVER: a record attempting no recognized spec-tree form is forced into the residual — only node, product, decision, and evidence forms are classified ([audit])
- NEVER: classification branches on a hardcoded suffix or naming form outside the injected naming-schema versions ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any test-double stands in for the recognizer or its version set — tests inject naming-schema-version fixtures as `as const` parameters and real filesystem records ([audit])
