# Versioned Filename Grammar Model

The Spec-Tree filename grammar is one shared token vocabulary together with an ordered set of naming-schema versions keyed by semantic version, each naming the methodology lines it serves. Each version composes the token sets it accepts from that vocabulary, so no token is declared twice and a breaking change to any of them is a major increment, refining [`21-kind-registry.adr.md`](spx/23-spec-tree.enabler/21-kind-registry.adr.md) and [`26-filename-grammar.adr.md`](spx/23-spec-tree.enabler/26-filename-grammar.adr.md). The first version serves no line and keeps names of the era before 3.0 classifying as superseded, one 3.x version serves the 3.0, 3.1, and 3.2 lines, and the 4.0 version serves the 4.0 line.

## Rationale

Each version after the first mirrors the methodology lines whose statement it encodes, because the methodology makes each version authoritative for the consumers that declare it, so a declaration selects versions by the lines they serve. The first version stays only so names of the era before 3.0 classify as superseded rather than invalid, and the 3.1 and 3.2 deltas leave naming unchanged, so one 3.x version serves all three lines.

A name is superseded exactly when no valid version accepts it and a version ordered before the declared target's does, so telling superseded from invalid needs the earlier versions' accepted sets as data. An ordered set of complete versions carries that data, where a single current schema plus a hand-curated legacy list cannot report which version a name belonged to. Semantic version keys order the set and name the version a superseded entry matched. A change to the node suffixes, the spec-file form, or the product-root form a version accepts is breaking, so it is a major increment, which keeps the ordering legible without inventing effective dates for versions whose only fixed fact is their succession.

Composition from a shared vocabulary is the only shape that satisfies "self-contained" and "declared exactly once" at the same time. The token literals live once in the vocabulary; a version references token sets rather than copying strings, so it is independently evaluable — classifying a name against one version reads only that version's sets — without duplicating any literal. Embedding a full literal copy per version would make each version self-describing at the cost of declaring every token in every version, the drift the single-source principle forbids; carrying only the groups that vary across versions would remove the duplication but leave a version unable to classify a name on its own.

The vocabulary is a superset of the kind registry because supersession is a property of grammar history. The suffixes of the era before 3.0 that no registered kind uses stay in the vocabulary, since adding them to the registry would resurrect them as valid kinds, while the suffixes of the 3.x and 4.0 versions are registered kinds and project from the registry. A suffix may belong to more than one version — the era before 3.0 and 4.0 both accept the capability suffix — and is still declared once.

A consumer that recognizes or rejects filenames by grammar token — deprecated-suffix rejection among them — reads the token sets from the library surface for the reason [`21-kind-registry.adr.md`](spx/23-spec-tree.enabler/21-kind-registry.adr.md) gives for kinds: a token re-declared in a consumer is drift the recognizer that owns the true vocabulary cannot see.

## Invariants

- The accepted suffix literals across all naming-schema versions are each sourced once: the suffixes no registered kind uses live in the shared vocabulary, the registered kinds' suffixes project from the kind registry, the two are disjoint, and their union is the full accepted set.
- The vocabulary's node-suffix literals equal the union of the versions' accepted node-suffix sets less the registered kinds' suffixes.
- Under a methodology declaration, the superseded suffix set equals the union of the accepted suffix sets of the versions ordered before the declared target's, less the union of the valid versions' accepted suffix sets.
- A declaration's valid versions are those serving `methodology.version`, plus those serving `methodology.migratingFrom` while it is declared.
- The newest naming-schema version is the maximum of the version set under semantic-version ordering.
- No invariant or testing rule of this record names a spec-file form; the forms each version accepts stand once, in the assertions of [`spx/23-spec-tree.enabler/29-filename-grammar.enabler/filename-grammar.md`](spx/23-spec-tree.enabler/29-filename-grammar.enabler/filename-grammar.md).
- A name's classification against a version is a function of that version's accepted token sets alone — independent of the other versions, process environment, and file contents.

## Verification

- ALWAYS: each version names the methodology lines it serves: the first version none, the 3.x version exactly the 3.0, 3.1, and 3.2 lines, and the 4.0 version exactly the 4.0 line

### Testing

- ALWAYS: naming-schema versions form an ordered set keyed by semantic version; a methodology declaration selects its valid members, and a name no valid member accepts classifies superseded when a member ordered before the declared target's accepts it ([property])
- ALWAYS: each naming-schema version is a composition that references token sets of the shared vocabulary and is independently evaluable without reading another version ([property])
- ALWAYS: each version's registered-kind node suffixes and decision suffixes project from the kind registry rather than re-declaring suffix literals ([mapping])
- ALWAYS: the newest naming-schema version exposed through the library surface is computed as the maximum of the version set ([compliance])
- NEVER: a suffix no registered kind uses is added to the kind registry to make a version self-contained — such suffixes live in the shared vocabulary ([mapping])
- NEVER: the newest-version identifier is declared apart from the version set — it is computed, not stated ([compliance])

### Audit

- ALWAYS: the shared vocabulary carries the filename grammar token literals no registered kind uses; registered kinds' suffixes project from the kind registry and are not re-declared in the vocabulary ([audit])
- ALWAYS: a consumer that classifies or rejects filenames by grammar token reads the token sets from the library registry surface ([audit])
- NEVER: a grammar token literal is declared in more than one place — across versions, in the kind registry, or in a consumer ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any test-double stands in for the grammar registry or naming-schema versions — tests read the real registry surface and construct naming-schema-version fixtures as local `as const` objects passed as parameters ([audit])
