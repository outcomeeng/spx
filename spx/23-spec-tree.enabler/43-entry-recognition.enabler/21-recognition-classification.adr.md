# Recognition Classification Result

The recognizer classifies every ordered `{NN}-{slug}{suffix}` directory and every product-root name against the grammar a product's methodology declaration selects, per [`spx/13-agent-capability-lifecycle.pdr.md`](spx/13-agent-capability-lifecycle.pdr.md): valid when a selected version accepts it, superseded — carrying the newest matching version — when only a version ordered before the declared target's accepts it, and invalid when a node directory matches neither, while decision and evidence files matching a selected version's form classify valid and a record attempting no recognized form yields no entry. Superseded and invalid join the source-entry union alongside product, node, decision, and evidence, so one entry stream partitions into the valid tree, the superseded list, and the invalid residual. The source supplies the versions and the selection the recognizer reads, directory descent follows only valid node entries, and the snapshot carries the superseded entries and invalid residual distinct from the assembled valid tree, refining [`26-filename-grammar.adr.md`](spx/23-spec-tree.enabler/26-filename-grammar.adr.md) and [`29-filename-grammar.enabler/21-versioned-grammar-model.adr.md`](spx/23-spec-tree.enabler/29-filename-grammar.enabler/21-versioned-grammar-model.adr.md).

## Rationale

An ordered `{NN}-{slug}{suffix}` directory is an attempt at a node, so a suffix matching no selected or earlier form is a real account of a non-conforming attempt rather than an absence: the recognizer retains it as an invalid entry rather than dropping it to null. Dropping the attempt forces a second traversal to recover the residual; classifying it makes the invalid set the complement of recognition over the node attempts in one pass, the residual-retention property [`26-filename-grammar.adr.md`](spx/23-spec-tree.enabler/26-filename-grammar.adr.md) requires. A record that attempts no recognized form — a node's own spec file, a coordination note, an unrelated file — is content within the tree, not a node attempt, so it yields no entry and never enters the residual; widening the residual to every visited name would bury non-conforming attempts under ordinary content.

Versioning covers node-directory suffixes, the spec-file form, and the product-root form, because the 4.0 line changes all three while decision and evidence forms stay fixed across the versions SPX reads. Each name classifies by its own version because artifacts at the target and at the migration source are both valid while a migration is open, so a migrating tree's mixed nesting is a state the recognizer traverses rather than a defect it reports. Scoping the invalid residual to ordered directories keeps a node's spec file, whose slug can begin with digits, from being mistaken for an ordered attempt, and superseded and invalid join the entry union as two further entry types, so one stream partitions without a parallel channel or a separate scanner.

The versions and the selection are parameters so classification is verified by passing naming-schema-version fixtures with no mocking, per [`26-filename-grammar.adr.md`](spx/23-spec-tree.enabler/26-filename-grammar.adr.md); the source supplies them, so production readers pass only the source. Descent follows only valid node entries because a superseded or invalid ordered directory is not a valid node, so its descendants are not part of the valid tree. Carrying superseded and invalid as snapshot fields distinct from the valid tree lets traversal, state derivation, and projection read the valid tree while a consumer auditing names reads the superseded and residual fields; folding the residual into the valid node list would force every tree consumer to filter non-valid entries at each call site.

## Invariants

- Every ordered `{NN}-{slug}{suffix}` directory classifies as exactly one of valid, superseded, or invalid; such an attempt is never dropped.
- A node directory classifies valid when a selected version accepts its suffix, superseded when only a version ordered before the declared target's accepts it, and invalid when neither does.
- The valid tree, the superseded list, and the invalid residual partition the classified entries: each appears in exactly one.
- A superseded entry carries the naming-schema version it matched.
- A record's classification is a function of the injected versions, the selection, and the record alone.

## Verification

### Testing

- ALWAYS: every product file, evidence file, decision file, and ordered `{NN}-{slug}{suffix}` directory maps to a classified source entry — valid (product, node, decision, or evidence), superseded (a product or node carrying the matched version), or invalid (a node) ([mapping])
- ALWAYS: the valid tree, the superseded list, and the invalid residual partition the classified ordered directories — each appears in exactly one ([compliance])
- ALWAYS: a record's classification follows the injected versions and selection — a suffix the selection leaves only to a version ordered before the declared target's classifies superseded, and a suffix a selected version accepts with no backing registered kind classifies invalid ([mapping])
- ALWAYS: directory descent follows only valid node entries; superseded and invalid ordered directories are not traversed ([mapping])
- ALWAYS: the snapshot carries the superseded entries and the invalid residual as fields distinct from the assembled valid tree ([compliance])
- NEVER: an ordered `{NN}-{slug}{suffix}` directory is dropped — a suffix matching neither a selected nor an earlier version is retained as an invalid entry, not silently skipped ([mapping])

### Audit

- ALWAYS: superseded and invalid are members of the source-entry union, so one entry stream carries every classification without a parallel channel or a separate scanner ([audit])
- ALWAYS: the recognizer accepts the naming-schema versions and the selection a methodology declaration derives as parameters, which the source supplies ([audit])
- NEVER: a record attempting no recognized spec-tree form is forced into the residual — only node, product, decision, and evidence forms are classified ([audit])
- NEVER: classification branches on a hardcoded suffix or naming form outside the injected versions ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any test-double stands in for the recognizer or its version set — tests inject naming-schema-version fixtures as `as const` parameters and real filesystem records ([audit])
