# Kind Registry Architecture

The spec-tree library is the single source of spec-tree kind vocabulary: one registry owns each kind's category, label, suffix, aliases, opening form, and admitted children, and every other view of that vocabulary derives from it. The registry declares the node kinds of every methodology grammar SPX reads, and the grammar a product's methodology declaration selects, per [`spx/13-agent-capability-lifecycle.pdr.md`](spx/13-agent-capability-lifecycle.pdr.md), decides which of them a read admits. A variant inherits its parent's opening and admitted children, and the 4.0 root, which has no directory suffix, declares its kind in its front matter as the product kind's name.

The 3.x node kinds carry fixed opening selectors, so a tree that declares a 3.x migration source renders its source-version nodes: `enabler` selects `PROVIDES` and `outcome` selects `WE BELIEVE THAT`. A product carries no opening, and a decision carries no opening keyword: at every methodology version a decision's Digest is its decision statement, the first prose paragraph after its title. Neither document class enters the kind registry's opening selectors.

## Rationale

One registry prevents path parsing, rendering, validation, and configuration from maintaining parallel kind vocabularies. Making the opening selector kind-owned lets Digest projection and validation consume the same declaration, including parent-kind inheritance for variants, while products and decisions need no selector: the methodology defines no product or decision opening at any version, a product document is projected Full wherever it is projected, and the decision statement the decision templates prescribe is the decision's Digest.

Opening and admitted children are kind-owned for the reason one registry exists: assembly, validation, and authoring each judge them, and a second table in any of them is drift the registry cannot see. Both methodology lines' kinds share the registry because a product migrating from 3.2 holds artifacts of both and a read resolves each against the kind it names.

## Invariants

- Every admitted kind is declared exactly once in `SPEC_TREE_CONFIG.KINDS`.
- `Kind` is `keyof typeof KIND_REGISTRY`; node and decision types and sub-registries derive from the same object.
- Every output-node kind resolves to exactly one opening keyword, directly or through parent-kind inheritance.
- An output-node kind with no resolved opening keyword cannot supply a Digest.
- Every node kind resolves to exactly one admitted-children set, directly or through its parent kind.

## Verification

- ALWAYS: every node kind entry carries its admitted children, a fixed set or inheritance from the parent kind
- ALWAYS: the product kind carries no opening
- ALWAYS: the 4.0 root spec's front-matter `kind` is read against the product kind's name rather than a separately declared value
- NEVER: a parser, assembler, validator, renderer, or command owns a separate kind-to-admitted-children mapping

### Audit

- ALWAYS: every kind entry carries category, label, suffix, and aliases ([audit])
- ALWAYS: every node kind entry carries its opening selector ([audit])
- ALWAYS: derived registries and types are computed from `KIND_REGISTRY` without parallel kind, suffix, category, label, alias, or opening constants ([audit])
- ALWAYS: the spec-tree configuration descriptor is co-located with the registry ([audit])
- NEVER: a renderer, parser, validator, or command module owns a separate kind-to-opening mapping ([audit])
- NEVER: tests intercept the production registry; they pass explicit test-scoped registries ([audit])
