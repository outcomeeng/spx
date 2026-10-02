# Versioned Filename Grammar Model

The spec-tree library declares the Spec-Tree filename grammar as one `as const` token vocabulary together with an ordered tuple of naming-schema versions keyed by semantic version, each mirroring the `outcomeeng/methodology` lines it serves and naming those lines: `1.0.0` carries the `.capability`, `.feature`, and `.story` node directories of the era before 3.0; `2.0.0` is the 3.x version, serving the 3.0, 3.1, and 3.2 lines with `.enabler` and `.outcome` node directories, `{slug}.md` node specs, and a `spx/{name}.product.md` root; and the 4.0 version, ordered after `2.0.0`, serves the 4.0 line with the seven 4.0 kind suffixes, `{slug}.spec.md` node specs, and a `spx/{name}.spec.md` root whose front matter declares `kind: product`. A methodology declaration selects its valid versions — those serving `methodology.version`, plus those serving `methodology.migratingFrom` while it is declared — and a name no valid version accepts is superseded when a version ordered before the declared target's accepts it. Each version is a composition that names which token sets of the shared vocabulary it accepts, so no token literal is declared more than once; a version's registered-kind suffix sets project from `KIND_REGISTRY`, and the dedicated naming-schema version the library exposes is the newest version's identifier computed as the maximum of the tuple. Each version also names a spec-file form and a product-root form among its composed token sets, so both are versioned alongside the node suffixes, and a breaking change to any of them is a major increment. This refines [`spx/23-spec-tree.enabler/21-kind-registry.adr.md`](../21-kind-registry.adr.md) and [`spx/23-spec-tree.enabler/26-filename-grammar.adr.md`](../26-filename-grammar.adr.md), fixing the concrete data shape their principles leave open.

## Rationale

`outcomeeng/methodology` `AUTHORITY.md` makes each version directory the authority for the consumers that declare it, so a naming-schema version mirrors the methodology lines whose statement it encodes, and a declaration selects versions by the lines they serve. A version that states no methodology line serves no declaration and has no place in the tuple: no line pairs `.enabler` or `.outcome` with the `{slug}.spec.md` form, so no version does. The 3.1 and 3.2 deltas leave node-directory, spec-file, and product-root naming unchanged, so one 3.x version serves every 3.x line.

A name is superseded exactly when no valid version accepts it and a version ordered before the declared target's does, so distinguishing superseded from invalid requires the earlier versions' accepted sets as data. An ordered tuple of complete versions carries that data; a single current schema plus a hand-curated legacy list cannot report which version a name belonged to. Semantic version keys order the tuple and name the version a superseded entry matched: a node-suffix, spec-file, or product-root change is breaking, so it is a major increment, which keeps the ordering legible without inventing effective dates for schemas whose only fixed fact is their succession.

Composition from a shared vocabulary is the only shape that satisfies "self-contained" and "declared exactly once" at the same time. The token literals live once in the vocabulary; a version references token sets rather than copying strings, so it is independently evaluable — classifying a name against one version reads only that version's sets — without duplicating any literal. Embedding a full literal copy per version would make each version self-describing at the cost of declaring every token in every version, the drift the single-source principle forbids; carrying only the groups that vary across versions would remove the duplication but leave a version unable to classify a name on its own.

The vocabulary is a superset of the kind registry because supersession is a property of grammar history, not of the registered taxonomy. The suffix literals `.feature` and `.story` are accepted by the `1.0.0` version and by no registered kind. Adding them to `KIND_REGISTRY` to make that version self-contained would resurrect them as valid kinds — re-deriving `NodeKind`, the node sub-registries, and every exhaustive switch over them — so they belong to the grammar vocabulary, separate from the registered kinds. The 3.x and 4.0 versions' suffix sets, by contrast, are exactly registered kinds, so they project from `KIND_REGISTRY` rather than re-declaring `.enabler`, `.outcome`, or the 4.0 suffixes.

A suffix may belong to more than one version: `.capability` belongs to the era before 3.0 and to 4.0, because the 4.0 taxonomy names it again. Its literal stays declared once — `capability` is a registered 4.0 kind, and the `1.0.0` version composes its suffix from `KIND_REGISTRY` — so the vocabulary still equals the union of the per-version sets without a second declaration.

A consumer that recognizes or rejects filenames by grammar token — deprecated-suffix rejection among them — reads the token sets from the library surface for the reason [`spx/23-spec-tree.enabler/21-kind-registry.adr.md`](../21-kind-registry.adr.md) gives for kinds: a token re-declared in a consumer is drift the recognizer that owns the true vocabulary cannot see.

## Invariants

- The accepted suffix literals across all naming-schema versions are each sourced once: the suffixes no registered kind uses live in the grammar vocabulary (`SPEC_TREE_GRAMMAR`), registered kinds' suffixes project from `KIND_REGISTRY`, the two are disjoint, and their union is the full accepted set.
- The grammar vocabulary's node-suffix literals equal the union of the naming-schema versions' accepted node-suffix sets less the registered kinds' suffixes.
- Under a methodology declaration, the superseded suffix set equals the union of the accepted suffix sets of the versions ordered before the declared target's, less the union of the valid versions' accepted suffix sets.
- A methodology declaration's valid versions are those serving `methodology.version`, plus those serving `methodology.migratingFrom` while it is declared.
- The dedicated naming-schema version is the maximum of the version tuple under semantic-version ordering.
- Each naming-schema version names a spec-file form: the 4.0 version's is a node directory's slug followed by the spec document-kind suffix, and the `1.0.0` and 3.x versions' is that slug with a plain `.md` extension (the bare `{slug}.md` form).
- A name's classification against a version is a function of that version's accepted token sets alone — independent of the other versions, process environment, and file contents.

## Verification

- ALWAYS: the 3.x version serves the 3.0, 3.1, and 3.2 lines, the 4.0 version serves the 4.0 line, and each version names the methodology lines it serves
- NEVER: a naming-schema version pairs `.enabler` or `.outcome` node directories with the `{slug}.spec.md` spec-file form
- ALWAYS: the 3.x version's product-root form is `spx/{name}.product.md`, and the 4.0 version's is `spx/{name}.spec.md` directly under `spx/`

### Testing

- ALWAYS: naming-schema versions form an ordered tuple keyed by semantic version; a methodology declaration selects its valid members, and a name no valid member accepts classifies superseded when a member ordered before the declared target's accepts it ([property])
- ALWAYS: each naming-schema version is a composition that references token sets of the shared vocabulary and is independently evaluable without reading another version ([property])
- ALWAYS: each version's registered-kind node suffixes and its decision suffixes project from `KIND_REGISTRY` rather than re-declaring suffix literals ([mapping])
- ALWAYS: the 4.0 naming-schema version's spec-file form is a node directory's slug followed by the spec document-kind suffix, and the `1.0.0` and 3.x versions' spec-file form is that slug with a plain `.md` extension — the bare `{slug}.md` form ([mapping])
- ALWAYS: the dedicated naming-schema version exposed through the library surface is the newest version's identifier computed as the maximum of the version tuple ([compliance])
- NEVER: a suffix no registered kind uses is added to `KIND_REGISTRY` as a live kind to make a version self-contained — such suffixes live in the grammar vocabulary, not the kind registry ([mapping])
- NEVER: the dedicated identifier is declared apart from the version tuple — it is computed, not hardcoded ([compliance])

### Audit

- ALWAYS: the grammar vocabulary (`SPEC_TREE_GRAMMAR`) is the `as const` surface carrying the filename grammar token literals no registered kind uses — `.feature` and `.story` among them; registered kinds' suffixes project from `KIND_REGISTRY` and are not re-declared in the grammar vocabulary ([audit])
- ALWAYS: a consumer that classifies or rejects filenames by grammar token reads the token sets from the library registry surface ([audit])
- NEVER: a grammar token literal is declared in more than one place — across versions, in the kind registry, or in a consumer module ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any test-double stands in for the grammar registry or naming-schema versions — tests read the real registry surface and construct naming-schema-version fixtures as local `as const` objects passed as parameters ([audit])
