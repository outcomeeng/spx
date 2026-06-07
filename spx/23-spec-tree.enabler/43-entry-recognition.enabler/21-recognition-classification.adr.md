# Recognition Classification Result

The recognizer classifies every filesystem record that attempts a recognized spec-tree form — a product file, a node directory, a decision file, or a co-located evidence file — into the spec-tree source-entry union, which carries a superseded entry type and an invalid entry type alongside the valid product, node, decision, and evidence types. An ordered `{NN}-{slug}{suffix}` directory whose suffix the canonical naming-schema version accepts classifies valid (a node), one whose suffix only a prior version accepts classifies superseded carrying that version, and one whose suffix no version accepts classifies invalid; product files, decision files, and evidence files matching the canonical form classify valid. A record attempting no recognized form yields no entry. The recognizer reads the naming-schema version set as an injected parameter defaulting to the library's owned versions; directory descent follows only valid node entries; and the snapshot carries the superseded entries and the invalid residual as fields distinct from the assembled valid tree. This refines [`26-filename-grammar.adr.md`](../26-filename-grammar.adr.md) and [`29-filename-grammar.enabler/21-versioned-grammar-model.adr.md`](../29-filename-grammar.enabler/21-versioned-grammar-model.adr.md).

## Rationale

An ordered `{NN}-{slug}{suffix}` directory is an attempt at a node, so a suffix matching no canonical form is a real account of a non-conforming attempt rather than an absence: the recognizer retains it as an invalid entry rather than dropping it to null. Dropping the attempt forces a second traversal to recover the residual; classifying it makes the invalid set the complement of recognition over the node attempts in one pass, the residual-retention property [`26-filename-grammar.adr.md`](../26-filename-grammar.adr.md) requires. A record that attempts no recognized form — a node's own spec file, a coordination note, an unrelated file — is content within the tree, not a node attempt, so it yields no entry and never enters the residual; widening the residual to every visited name would bury non-conforming attempts under ordinary content.

Versioning applies to node directory suffixes alone, because the naming-schema history changes which node suffixes are canonical while product, decision, and evidence forms stay fixed. Scoping superseded and invalid to ordered directories keeps a node's spec file — `{slug}.md`, whose slug can begin with digits — from being mistaken for an ordered attempt. Source entries discriminate by a `type` field, so superseded and invalid join that union as two further types; one entry stream then partitions into the valid tree, the superseded list, and the residual without a parallel channel or a separate scanner.

The schema set is an injected parameter so classification is verified by passing naming-schema-version fixtures with no mocking, per [`26-filename-grammar.adr.md`](../26-filename-grammar.adr.md); defaulting it to the library's owned versions leaves production callers passing only a record. Descent follows only valid node entries because a superseded or invalid ordered directory is not a valid node, so its descendants are not part of the valid tree — emitting recognized descendants below an unregistered ordered directory is the case the source spec forbids. Carrying superseded and invalid as snapshot fields distinct from the valid tree lets traversal, state derivation, and projection read the valid tree while a consumer auditing names reads the superseded and residual fields; folding the residual into the valid node list would force every tree consumer to filter non-valid entries at each call site.

## Invariants

- Every ordered `{NN}-{slug}{suffix}` directory classifies as exactly one of valid, superseded, or invalid; such an attempt is never dropped.
- A node directory classifies valid when the canonical version accepts its suffix, superseded when only a prior version accepts it, and invalid when no version accepts it.
- The valid tree, the superseded list, and the invalid residual partition the classified entries: each appears in exactly one.
- A superseded entry carries the naming-schema version it matched.
- A record's classification is a function of the injected version set and the record alone.

## Verification

### Audit

- ALWAYS: every product file, evidence file, decision file, and ordered `{NN}-{slug}{suffix}` directory maps to a classified source entry — valid (product, node, decision, or evidence), superseded (a node carrying the matched version), or invalid (a node) ([audit])
- ALWAYS: superseded and invalid are members of the source-entry union, so one entry stream partitions into the valid tree, the superseded list, and the residual ([audit])
- ALWAYS: the recognizer accepts the naming-schema version set as a parameter defaulting to the library's owned versions and derives accepted suffixes from that set ([audit])
- ALWAYS: directory descent follows only valid node entries; superseded and invalid ordered directories are not traversed ([audit])
- ALWAYS: the snapshot carries the superseded entries and the invalid residual as fields distinct from the assembled valid tree ([audit])
- NEVER: an ordered `{NN}-{slug}{suffix}` directory is dropped — a suffix matching no version is retained as an invalid entry, not silently skipped ([audit])
- NEVER: a record attempting no recognized spec-tree form is forced into the residual — only node, product, decision, and evidence forms are classified ([audit])
- NEVER: classification branches on a hardcoded suffix or a prior naming form outside the injected version set ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any test-double stands in for the recognizer or its version set — tests inject naming-schema-version fixtures as `as const` parameters and real filesystem records ([audit])
