<overview>

The ordered procedure that fixes a node's kind, the boundaries that settle disputes, and the structural-quality checks a projected structure passes before durable files are written. A skill that classifies or places a node reads this reference before it fixes a kind.

</overview>

<contents>

1. `<kind_decision_procedure>`: the seven ordered tests
2. `<boundaries>`: the three boundaries that settle most disputes
3. `<semantic_density>`: what a node path must say without directory access
4. `<structure_scorecard>`: validity checks and leading metrics for structure
5. `<ownership_scorecard>`: validity checks for which node owns a meaning

</contents>

<kind_decision_procedure>

Apply the tests top to bottom; the first that holds fixes the kind. A node never takes a kind whose containment rules forbid the children it holds.

1. **`.product`** — Answer the three product questions: does the scope need a surface or interface the tree lacks; does it run, ship, and transfer as a whole when everything around it disappears; does it have its own backlog, checkout, and owner. Each yes supports a product; no count settles it — the operator judges. A scope holding a `.surface`, an `.interface`, or another `.product` is never a domain. Independent version numbers support no product.
2. **`.variant`** — The node implements its parent output's whole contract, and the parent's selection source serves it as one implementation. A child implementing a part of its parent is not a variant.
3. **`.substrate`** — Transplant the node into an unrelated product. If it keeps its full meaning — process, filesystem, git, subprocess, encoding, rendering primitives — it is substrate.
4. **`.surface`** — The node provides an outside-facing boundary and owns grammar, rendering, invocation, and protocol without its own semantic vocabulary: a user interface, a programming interface, an agentic interface, or a named family of concrete surfaces. A family surface owns the shared audience, affordance class, packaging promise, and the contract that selects among its children; its children own concrete platform, protocol, or language boundaries. A node that owns concepts, rules, or invariants is a `.domain`.
5. **`.interface`** — Strip every surface. If the remaining contract — resources, verbs, selectors, payload shapes, lifecycle, error semantics — serves a command-line interface and a web programming interface equally, it is an interface.
6. **`.domain`** — The node owns a bounded semantic context with vocabulary, rules, and invariants that other nodes speak.
7. **`.capability`** — The remaining reusable product behavior, with meaning outside any one consumer and no semantic world of its own.

</kind_decision_procedure>

<boundaries>

- **Product versus domain**: containment and the three product questions.
- **Substrate versus capability**: the transplant test — product semantics present or absent.
- **Capability versus domain**: the vocabulary test — a single behavior versus a body of language and rules.

Placement follows what a node is, never who consumes it. New dependence on a node never justifies its move, extraction, or reshape. A shared node sits at a low index by its own foundational depth.

</boundaries>

<semantic_density>

Every non-root node path answers two questions without directory access: what product concern it owns, and which kind owns that concern. The suffix answers the kind; a top-level stem carries the concern; a child of a family uses its own stem when its parent path supplies the family concern, so `85-sdk.surface/20-typescript.surface` is the TypeScript surface of the SDK family. `capabilities.capability` repeats the suffix and hides the concern.

A product may scaffold predictable structure before every implementation exists — `cli.surface`, `api.surface`, `sdk.surface` — only when a product-level declaration or decision names the channel and the node opening states its concrete external audience or boundary. Otherwise the stem is a bucket.

</semantic_density>

<structure_scorecard>

Score every proposed node or structural slice before authoring durable files. A failed validity check blocks the structure; leading metrics guide decomposition and Review.

| Metric                          | Type           | Pass signal                                                                                                       | Failure signal                                                                                      |
| ------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Semantic density                | Validity check | Every non-root path carries a product concern plus kind suffix                                                    | A path repeats only the role, hides its family, or uses an unnamed generic channel                  |
| Role-bucket absence             | Validity check | Product concerns appear directly as nodes                                                                         | A role-named wrapper holds the product-named nodes                                                  |
| Sibling abstraction consistency | Validity check | Siblings are peer concerns or children of one family                                                              | A family and its children sit beside each other                                                     |
| Family grouping                 | Validity check | A surface family owns its concrete surfaces as children                                                           | `sdk-typescript.surface` sits beside `sdk.surface`                                                  |
| Kind classification             | Leading metric | Applicable ordered tests for every concern; recorded product/domain rationale naming containment or the questions | Classification by consumer, current path, topic grouping, or code layout                            |
| Containment                     | Validity check | The parent admits every child kind                                                                                | A child requires a kind its parent cannot contain                                                   |
| Dependency evidence             | Validity check | Each claimed prerequisite has a falsifiable consequence and precedes its consumer                                 | A prerequisite lacks evidence, follows its consumer, or shares its index; numeric separation alone  |
| Context visibility              | Leading metric | Readers load every sibling contract; consumption and scope distinguish constraints from awareness                 | An unread peer, hidden provider internals, or an unrelated earlier contract treated as prerequisite |

</structure_scorecard>

<ownership_scorecard>

| Metric                         | Type           | Pass signal                                                                                                  | Failure signal                                                                               |
| ------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Domain ownership               | Validity check | A bounded semantic context owns its vocabulary, rules, and invariants                                        | Several places define the same domain vocabulary                                             |
| Capability extraction evidence | Validity check | A reusable behavior belongs to two or more semantic owners, or has an independent lifecycle and verification | Extraction moves a single-owner behavior away from the node that owns its meaning            |
| Substrate purity               | Validity check | Substrate APIs keep product-domain vocabulary out                                                            | Substrate names sessions, verification, outcomes, or other product concepts                  |
| Interface justification        | Leading metric | Stable resources, verbs, selectors, payloads, lifecycle, and errors                                          | An interface wraps only a single internal call path                                          |
| Surface thinness               | Leading metric | Grammar, rendering, invocation, protocol; family surfaces add audience, packaging, and child selection       | A surface owns semantics, persistence, backend selection, or verification logic              |
| Operational concern separation | Validity check | Semantic ownership assigns persistence, delivery, backend, and state                                         | A node conflates a delivered result with persistence, or a backend defines product semantics |

A structural Review reports validity checks first; any failure rejects the structure.

</ownership_scorecard>
