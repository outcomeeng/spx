# Kind Registry Architecture

`src/lib/spec-tree/config.ts` is the single runtime source of spec-tree kind vocabulary: it declares `SPEC_TREE_CONFIG` as one `as const` semantic object whose flat `KINDS` registry owns each kind's category, label, suffix, aliases, and opening selector; an output-node selector is either a fixed keyword or inheritance from the parent kind, while non-node kinds carry no opening selector. `KIND_REGISTRY`, category constants, inferred kind types, and node and decision sub-registries are projections of that object.

The source-version node kinds remain renderable during migration: `enabler` selects `PROVIDES` and `outcome` selects `WE BELIEVE THAT`. A product carries no opening, and a decision carries no opening keyword: at every methodology version a decision's Digest is its decision statement, the first prose paragraph after its title. Neither document class enters the kind registry's opening selectors.

## Rationale

One registry prevents path parsing, rendering, validation, and configuration from maintaining parallel kind vocabularies. Making the opening selector kind-owned lets Digest projection and validation consume the same declaration, including parent-kind inheritance for variants, while products and decisions need no selector: the methodology defines no product or decision opening at any version, a product document is projected Full wherever it is projected, and the decision statement the decision templates prescribe is already the decision's Digest.

## Invariants

- Every admitted kind is declared exactly once in `SPEC_TREE_CONFIG.KINDS`.
- `Kind` is `keyof typeof KIND_REGISTRY`; node and decision types and sub-registries derive from the same object.
- Every output-node kind resolves to exactly one opening keyword, directly or through parent-kind inheritance.
- An output-node kind with no resolved opening keyword cannot supply a Digest.
- Configuration may select registered kinds and cannot redefine their semantic metadata.

## Verification

### Audit

- ALWAYS: every kind entry carries category, label, suffix, aliases, and its opening selector ([audit])
- ALWAYS: derived registries and types are computed from `KIND_REGISTRY` without parallel kind, suffix, category, label, alias, or opening constants ([audit])
- ALWAYS: the spec-tree configuration descriptor is co-located with the registry and validates selections against it ([audit])
- NEVER: a renderer, parser, validator, or command module owns a separate kind-to-opening mapping ([audit])
- NEVER: tests intercept the production registry; they pass explicit test-scoped registries ([audit])
