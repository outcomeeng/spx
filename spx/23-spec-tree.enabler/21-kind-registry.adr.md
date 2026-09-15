# Kind Registry Architecture

GOVERNS the single runtime source of spec-tree kind vocabulary. `src/lib/spec-tree/config.ts` declares `SPEC_TREE_CONFIG` as one `as const` semantic object whose flat `KINDS` registry owns each kind's category, label, suffix, aliases, and opening selector; an output-node selector is either a fixed keyword or inheritance from the parent kind, while non-node kinds carry no opening selector. `KIND_REGISTRY`, category constants, inferred kind types, and node and decision sub-registries are projections of that object.

The source-version node kinds remain renderable during migration: `enabler` selects `PROVIDES` and `outcome` selects `WE BELIEVE THAT`. Product `OFFERS` and decision `GOVERNS` openings are methodology-fixed document rules and do not enter the kind registry.

## Rationale

One registry prevents path parsing, rendering, validation, and configuration from maintaining parallel kind vocabularies. Making the opening selector kind-owned lets Digest projection and validation consume the same declaration, including parent-kind inheritance for variants, while keeping product and decision openings at the methodology layer that defines those document classes.

## Invariants

- Every admitted kind is declared exactly once in `SPEC_TREE_CONFIG.KINDS`.
- `Kind` is `keyof typeof KIND_REGISTRY`; node and decision types and sub-registries derive from the same object.
- Every output-node kind resolves to exactly one opening keyword, directly or through parent-kind inheritance.
- A kind with no resolved opening keyword cannot supply a Digest.
- Configuration may select registered kinds and cannot redefine their semantic metadata.

## Verification

- ALWAYS: every kind entry carries category, label, suffix, aliases, and its opening selector.
- ALWAYS: derived registries and types are computed from `KIND_REGISTRY` without parallel kind, suffix, category, label, alias, or opening constants.
- ALWAYS: the spec-tree configuration descriptor is co-located with the registry and validates selections against it.
- NEVER: a renderer, parser, validator, or command module owns a separate kind-to-opening mapping.
- NEVER: tests intercept the production registry; they pass explicit test-scoped registries.
