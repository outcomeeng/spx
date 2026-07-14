# Plan: Skill Conformance Oracle

## Spec-file form: `{slug}.spec.md` canonical, `{slug}.md` superseded

The canonical spec-file form is `{slug}.spec.md` — a document-kind suffix parallel
to `.adr.md` / `.pdr.md`, recognized by suffix rather than by comparing the stem to
the parent directory slug. The bare `{slug}.md` form is superseded: still recognized
during transition, by slug-match to the parent node directory. The oracle's binary
verdict classifies both recognized forms valid and any other path foreign.

The `.spec.md` token and the spec-file naming-schema version are owned by
`spx/23-spec-tree.enabler/29-filename-grammar.enabler`; the oracle consumes them
through the grammar surface and hard-codes no form.

## Deferred: file migration and consuming-skill update

Renaming the product's `{slug}.md` spec files to `{slug}.spec.md`, and updating the
spec-tree plugin skills that read and write spec files (`/contextualize`, `/author`,
`/decompose`, `/align`) plus the methodology's `node-types.md`, is coordinated
cross-product work. The recognition half (grammar version plus the oracle) ships
first and accepts both forms, so nothing breaks while the product's spec files
remain `{slug}.md`. The plugin-side update is an upstream follow-up.

The filesystem source's node-ref builder `sourceRefForNode` in
`src/lib/spec-tree/index.ts` hard-codes the spec-file ref as `{slug}.md`, so a node
migrated to the canonical `{slug}.spec.md` form is not readable through
`readText(node.ref)` until the builder selects the node's actual spec-file form. The
fix belongs with the recognizer, not this grammar slice: switching the builder to the
canonical suffix now would point every current node's ref at a non-existent
`{slug}.spec.md` and break every read, since no file has migrated yet. The builder
must read `{slug}.spec.md` when the node carries it and fall back to the superseded
`{slug}.md` otherwise — dual-form resolution the recognizer owns, landing with the
migration above.

## Deferred: eval-lane assertion

The spec omits an `[eval]` assertion for the oracle itself. The intended eval — run a
skill operation and score whether every file it produced maps to the valid verdict —
requires the recognition implementation to exist before it can be authored as a
testable eval-lane assertion. Add it after the recognition tests pass.

## Build steps

1. Extend the versioned grammar in `29-filename-grammar.enabler`: add the spec-file
   form to the grammar vocabulary and the naming-schema version model, with
   `{slug}.spec.md` canonical and `{slug}.md` superseded. Align its ADR and spec.
2. Author the oracle's conformance-classification ADR: binary valid/foreign path
   classifier, canonical spec by `.spec.md` suffix, superseded spec by slug-match,
   notes/eval-lane/`EXCLUDE` by grammar token, derived entirely from the grammar,
   separate from entry-recognition, DI and no mocking.
3. Align the oracle spec's spec-file assertion to the suffix-recognized form.
4. Write tests covering every form, then implement the recognizer in
   `src/lib/spec-tree/`. Before the eval-lane placement rule can derive from the
   grammar, add an eval-lane container directory token (`evals`) to
   `SPEC_TREE_GRAMMAR` in `29-filename-grammar.enabler`: the structured `EVAL`
   contract carries the `evals` container, inner definition filenames, and `runs`
   directory name, so recognition consumes the complete lane shape without a
   parallel literal.
5. Run audit gates, then add the deferred `[eval]` assertion.
