# Kind Registry Architecture

`src/lib/spec-tree/config.ts` is the single runtime source of spec-tree kind vocabulary: it declares `SPEC_TREE_CONFIG` as one `as const` semantic object whose flat `KINDS` registry owns each kind's category, label, suffix, and aliases and, for each kind that carries them, its opening selector and containment selector; an opening selector is either a fixed opening form — the ordered clause keywords the kind's spec opens with, the first of which is its opening keyword — or inheritance from the parent kind, and every node-category kind carries one while the product and decision kinds carry none; a containment selector is either a fixed set of admitted child kinds or inheritance of the parent kind's admitted set less the inheriting kind, and every node-category kind and the product kind carry one while the decision kinds carry none. `KIND_REGISTRY`, category constants, inferred kind types, and node, product, and decision sub-registries are projections of that object.

The registry declares the node kinds of every methodology grammar spx reads, and the grammar selects which of them a read admits, per [`spx/23-spec-tree.enabler/26-filename-grammar.adr.md`](26-filename-grammar.adr.md). The 3.x node kinds are those `outcomeeng/methodology` states in `versions/3.0/04-node-model.md` and `versions/3.0/90-grammar.md`, unchanged by the `versions/3.1/README.md` and `versions/3.2/README.md` deltas: `enabler` opens `PROVIDES … SO THAT … CAN …` and admits `enabler` children, and `outcome` opens `WE BELIEVE THAT … WILL … CONTRIBUTING TO …` and admits `enabler` and `outcome` children; both remain renderable while a product declares a 3.x line or migrates from one. The 4.0 node kinds are those `outcomeeng/methodology` states in `versions/4.0/methodology/product-tree/node/nodes.md`: `substrate` opens `SUPPLIES … SO THAT … CAN …`, `capability` opens `PROVIDES … SO THAT … CAN …`, `domain` opens `OWNS … SO THAT … CAN …`, `interface` opens `ADAPTS … FOR … SO THAT … CAN …`, `surface` opens `EXPOSES … TO … SO THAT … CAN …`, and `variant` inherits its parent kind's opening.

4.0 containment follows the fixed foundational order `substrate ≺ capability ≺ domain ≺ interface ≺ surface`: each of those five output kinds admits its own kind, every more-foundational output kind, and `variant`; `variant` admits its parent kind's admitted set less `variant`; and `product` — a product-category kind with directory suffix `.product`, no opening selector, and no assertion, malleability, or state — admits the five output kinds and `product`. The 4.0 tree root carries no directory suffix, so its spec declares the product kind in front matter as `kind: product`, whose value is the `product` kind's registry key, per `versions/4.0/methodology/product-tree/product.md` and `versions/4.0/methodology/product-tree/materialization/grammar.md`. A product carries no opening, and a decision's Digest is its decision statement — the first prose paragraph after its title — at every methodology version, so no opening keyword for either enters the kind registry.

## Rationale

One registry prevents path parsing, rendering, validation, and configuration from maintaining parallel kind vocabularies. Making the opening selector kind-owned lets Digest projection and validation consume the same declaration, including parent-kind inheritance for variants, while a decision's Digest stays its decision statement, which no registry opening selects. An opening form that carries every clause keyword, not only the leading one, is what lets the registry state `ADAPTS … FOR` and `EXPOSES … TO` as the 4.0 statement writes them, while the leading keyword stays the one value a Digest reads.

Containment is kind-owned for the reason openings are: assembly, validation, and authoring each judge whether a parent admits a child of its own naming-schema version, and a second kind-to-children table in any of them is drift the registry cannot see. Inheritance serves the variant in both selectors because a variant implements its parent's whole contract and so takes its parent's opening and its parent's admitted children, less a nested variant. The five 4.0 output kinds' admitted sets follow from one order rather than seven hand-written lists, so the nesting the methodology states cannot fall out of step with any one entry.

Both lines' kinds share one registry because a product migrating from 3.2 to 4.0 holds artifacts of both, and a read must resolve each against the kind it names. Which kinds a given read admits is the grammar's selection from the product's methodology declaration, not a property of the registry or of product configuration, so registering a kind never admits it to a product that does not declare its line, and a product never redefines kinds, suffixes, or containment, per `versions/4.0/methodology/product-tree/node/nodes.md`. Making the root front-matter value the `product` kind's registry key gives the 4.0 root, which has no suffix, the same single source every suffixed node reads.

## Invariants

- Every admitted kind is declared exactly once in `SPEC_TREE_CONFIG.KINDS`.
- `Kind` is `keyof typeof KIND_REGISTRY`; node, product, and decision types and sub-registries derive from the same object.
- Every node-category kind resolves to exactly one opening keyword, directly or through parent-kind inheritance.
- Every node-category kind resolves to exactly one admitted-child set, directly or through parent-kind inheritance.
- The admitted-child sets of `substrate`, `capability`, `domain`, `interface`, and `surface` are nested in that order: each contains every set before it.
- A node-category kind's Digest reads its resolved opening keyword; a decision's Digest is its decision statement and reads no registry opening.
- Configuration selects no kinds and redefines no kind metadata; the kinds a read admits are those of the naming-schema versions the methodology declaration selects.

## Verification

- ALWAYS: every node-category kind entry carries its containment selector — a fixed set of admitted child kinds, or inheritance of the parent kind's admitted set less the inheriting kind
- ALWAYS: the 4.0 kind entries carry the opening forms and admitted-child sets `versions/4.0/methodology/product-tree/node/nodes.md` states — `substrate` opens `SUPPLIES … SO THAT … CAN …` and admits `substrate` and `variant`; `capability` opens `PROVIDES … SO THAT … CAN …` and admits `substrate`, `capability`, and `variant`; `domain` opens `OWNS … SO THAT … CAN …` and admits `substrate`, `capability`, `domain`, and `variant`; `interface` opens `ADAPTS … FOR … SO THAT … CAN …` and admits `substrate`, `capability`, `domain`, `interface`, and `variant`; `surface` opens `EXPOSES … TO … SO THAT … CAN …` and admits the five output kinds and `variant`; `variant` inherits its parent kind's opening and admitted set less `variant`
- ALWAYS: the 3.x kind entries carry the opening forms and admitted-child sets `versions/3.0/04-node-model.md` states — `enabler` opens `PROVIDES … SO THAT … CAN …` and admits `enabler`; `outcome` opens `WE BELIEVE THAT … WILL … CONTRIBUTING TO …` and admits `enabler` and `outcome`
- ALWAYS: the `product` kind entry carries the product category, the `.product` directory suffix, no opening selector, and an admitted-child set of the five 4.0 output kinds and `product`
- ALWAYS: the 4.0 root spec's front-matter `kind` value is read against the `product` kind's registry key rather than a separately declared literal
- NEVER: a parser, assembler, validator, renderer, or command module owns a separate kind-to-containment mapping
- ALWAYS: a kind selection in product configuration fails configuration resolution naming the field

### Audit

- ALWAYS: every kind entry carries category, label, suffix, and aliases, every node-category kind entry carries its opening selector, and the product and decision kind entries carry none ([audit])
- ALWAYS: derived registries and types are computed from `KIND_REGISTRY` without parallel kind, suffix, category, label, alias, or opening constants ([audit])
- ALWAYS: the spec-tree configuration descriptor is co-located with the registry ([audit])
- NEVER: a renderer, parser, validator, or command module owns a separate kind-to-opening mapping ([audit])
- NEVER: tests intercept the production registry; they pass explicit test-scoped registries ([audit])
