# Versioned Filename Grammar Model

The spec-tree library declares the Spec-Tree filename grammar as one `as const` token vocabulary together with an ordered tuple of naming-schema versions keyed by semantic version, the highest of which is canonical. Each version is a composition that names which token sets of the shared vocabulary it accepts, so no token literal is declared more than once; the canonical version's suffix sets project from `KIND_REGISTRY`, and the dedicated naming-schema version the library exposes is the canonical version's identifier computed as the maximum of the tuple. This refines [`21-kind-registry.adr.md`](../21-kind-registry.adr.md) and [`26-filename-grammar.adr.md`](../26-filename-grammar.adr.md), fixing the concrete data shape their principles leave open.

## Rationale

A name is superseded exactly when an earlier schema version accepted it and the canonical one does not, so distinguishing superseded from invalid requires the prior versions' accepted sets as data. An ordered tuple of complete versions carries that data; a single current schema plus a hand-curated legacy list cannot report which version a name belonged to. Semantic version keys order the tuple and name the version a superseded entry matched: a node-suffix taxonomy change is breaking, so it is a major increment, which keeps the ordering legible without inventing effective dates for schemas whose only fixed fact is their succession.

Composition from a shared vocabulary is the only shape that satisfies "self-contained" and "declared exactly once" at the same time. The token literals live once in the vocabulary; a version references token sets rather than copying strings, so it is independently evaluable — classifying a name against one version reads only that version's sets — without duplicating any literal. Embedding a full literal copy per version would make each version self-describing at the cost of declaring every token in every version, the drift the single-source principle forbids; carrying only the groups that vary across versions would remove the duplication but leave a version unable to classify a name on its own.

The vocabulary is a superset of the live kind registry because supersession is a property of grammar history, not of the live taxonomy. Historical suffix literals such as `.capability`, `.feature`, and `.story` are accepted by a prior version and by no live kind. Adding them to `KIND_REGISTRY` to make the prior version self-contained would resurrect them as valid kinds — re-deriving `NodeKind`, the node sub-registries, and every exhaustive switch over them — so they belong to the grammar vocabulary, separate from the live kinds. The canonical version's suffix sets, by contrast, are exactly the live kinds, so they project from `KIND_REGISTRY` rather than re-declaring `.enabler` and `.outcome`.

A consumer that recognizes or rejects filenames by grammar token — deprecated-suffix rejection among them — reads the token sets from the library surface for the reason [`21-kind-registry.adr.md`](../21-kind-registry.adr.md) gives for kinds: a token re-declared in a consumer is drift the recognizer that owns the true vocabulary cannot see.

## Invariants

- The suffix literals in the token vocabulary equal the union of the accepted suffix sets across all naming-schema versions.
- The superseded suffix set equals the union of the earlier versions' accepted suffix sets less the canonical version's accepted suffix set.
- The canonical naming-schema version is the maximum of the version tuple under semantic-version ordering.
- A name's classification against a version is a function of that version's accepted token sets alone — independent of the other versions, process environment, and file contents.

## Verification

### Audit

- ALWAYS: the filename grammar token vocabulary is one `as const` surface in the spec-tree library carrying every accepted suffix literal across all naming-schema versions, including suffixes no live kind uses ([audit])
- ALWAYS: naming-schema versions form an ordered tuple keyed by semantic version, the highest member canonical and earlier members superseded ([audit])
- ALWAYS: each naming-schema version is a composition that references token sets of the shared vocabulary and is independently evaluable without reading another version ([audit])
- ALWAYS: the canonical version's node and decision suffix sets project from `KIND_REGISTRY` rather than re-declaring suffix literals ([audit])
- ALWAYS: the dedicated naming-schema version exposed through the library surface is the canonical version's identifier computed as the maximum of the version tuple ([audit])
- ALWAYS: a consumer that classifies or rejects filenames by grammar token reads the token sets from the library registry surface ([audit])
- NEVER: a grammar token literal is declared in more than one place — across versions, in the live kind registry, or in a consumer module ([audit])
- NEVER: a superseded suffix is added to `KIND_REGISTRY` as a live kind to make a prior version self-contained — historical suffixes live in the grammar vocabulary, not the live kind registry ([audit])
- NEVER: the canonical identifier is declared apart from the version tuple — it is computed, not hardcoded ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any test-double stands in for the grammar registry or naming-schema versions — tests read the real registry surface and construct naming-schema-version fixtures as local `as const` objects passed as parameters ([audit])
