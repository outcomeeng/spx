# Conformance Classification

The skill-conformance oracle classifies every path beneath the tracked `spx/` tree as valid — a form a Spec-Tree skill operation produces — or foreign, with no third outcome. It recognizes the canonical spec-file form by its spec document-kind suffix and the superseded spec-file form by matching the file stem to the parent node directory slug; coordination-note, eval-lane, and exclusion-registry forms by their grammar tokens; and product, node, decision, and evidence forms through the entry recognizer it composes. The classifier accepts a filesystem record, its ancestry context — the parent node directory slug, whether the record sits directly under a node directory, under an evidence directory, under an eval-lane directory, or at the product root — and the naming-schema version set as an injected parameter defaulting to the library's owned versions, and returns a binary valid-or-foreign verdict; every recognized form is read from the versioned grammar surface of [`spx/23-spec-tree.enabler/29-filename-grammar.enabler`](../29-filename-grammar.enabler/filename-grammar.md), and the oracle declares none itself. This refines [`../29-filename-grammar.enabler/21-versioned-grammar-model.adr.md`](../29-filename-grammar.enabler/21-versioned-grammar-model.adr.md) and stands beside [`../43-entry-recognition.enabler/21-recognition-classification.adr.md`](../43-entry-recognition.enabler/21-recognition-classification.adr.md) without altering it.

## Rationale

The oracle answers one question — did a Spec-Tree skill produce this path — so its verdict is binary. Entry recognition answers a different question, partitioning node attempts into valid, superseded, and invalid to assemble a snapshot, and it deliberately yields no entry for a spec file, a coordination note, or ordinary content. Folding conformance classification into entry recognition would force those forms into the snapshot residual that every tree consumer filters; a distinct classifier reading the same grammar keeps the snapshot contract intact while answering the conformance question over every path.

Recognizing the canonical spec file by its document-kind suffix removes the context dependency at the source: a name carrying the spec suffix is a spec by the same logic that makes a name carrying `.adr`/`.pdr` a decision, so recognition reads the name, not a comparison against the parent slug. The superseded spec form is a bare `{slug}.md`, which a suffix cannot distinguish from ordinary markdown, so it is recognized only by matching the stem to the parent node directory slug. Confining that stem-to-parent comparison to the superseded form leaves the canonical recognizer free of it, so the context dependency retires as the tree migrates to the canonical form.

Reading every recognized form from the grammar surface follows the single-source principle [`../21-kind-registry.adr.md`](../21-kind-registry.adr.md) and [`../26-filename-grammar.adr.md`](../26-filename-grammar.adr.md) establish: a form declared in the oracle is drift the grammar owner cannot see. Injecting the naming-schema version set lets classification be verified by passing version fixtures rather than mocking, the same testability the sibling recognizers adopt.

Rejected: extending entry recognition to classify spec files, notes, eval-lane files, and the exclusion registry — it changes the snapshot's residual semantics every tree consumer depends on. Rejected: hard-coding the spec, note, eval-lane, and exclusion forms in the oracle — it forks the grammar vocabulary the recognizer is meant to own. Rejected: a fixed `spec.md` sentinel for the canonical spec file — it discards the self-documenting slug a `{slug}.spec.md` form keeps while delivering the same context-free recognition.

## Invariants

- Every path beneath the tree receives exactly one verdict; the valid and foreign sets partition the tree's paths.
- A path's verdict is a function of the path, its ancestry context, and the injected naming-schema version set alone — independent of process environment, traversal order, and file contents.
- The canonical spec-file form is the parent node directory slug followed by the spec document-kind suffix; the superseded spec-file form is that slug with a plain `.md` extension — the bare `{slug}.md` form.
- The oracle's recognized-form set equals the forms the grammar declares; it adds none.

## Verification

### Testing

- ALWAYS: a spec file carrying the canonical spec document-kind suffix directly within a node directory classifies valid by its suffix, independent of the parent slug, process environment, and file contents ([mapping])
- ALWAYS: a bare `{slug}.md` file directly within a node directory classifies valid when its stem equals the parent node directory slug and foreign when the stem differs ([mapping])
- ALWAYS: coordination-note, eval-lane, and exclusion-registry paths matching their grammar tokens classify valid, and a path matching no recognized form classifies foreign ([mapping])
- ALWAYS: the valid and foreign verdicts partition every classified path — each path appears under exactly one ([compliance])

### Audit

- ALWAYS: the classifier accepts the naming-schema version set as a parameter defaulting to the library's owned versions, so classification is verified by injecting schema-version fixtures ([audit])
- ALWAYS: the oracle reads every recognized form — spec-file, coordination-note, eval-lane, exclusion-registry, and the entry-recognizer forms — from the grammar surface of `spx/23-spec-tree.enabler/29-filename-grammar.enabler` ([audit])
- ALWAYS: the oracle composes the entry recognizer for product, node, decision, and evidence forms rather than re-deriving them ([audit])
- NEVER: the oracle hard-codes a spec-file, coordination-note, eval-lane, or exclusion-registry form outside the grammar surface ([audit])
- NEVER: the oracle alters entry recognition's classification or the assembled snapshot — it is a distinct read over the same grammar ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any test-double stands in for the classifier or its naming-schema version set — tests inject version fixtures as local `as const` parameters and real filesystem records ([audit])
