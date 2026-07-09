<objective>
The six-kind vocabulary and ordered decision procedure for projecting current behavior into the next methodology target structure.
</objective>

<table_of_contents>

1. `<kinds>`: six node kinds and ownership boundaries
2. `<ordered_kind_decision>`: first-match decision procedure
3. `<kind_order>`: foundational order for output kinds
4. `<containment>`: parent/child admissibility
5. `<openings>`: current authoring-compatible opening forms
6. `<operational_terms>`: persistence, delivery, backend, and node state
7. `<tier_state_terms>`: tier, base node states, and status claims
8. `<top_level_projection>`: product-named top-level nodes without role buckets
9. `<classification_output>`: required concern-classification row fields
10. `<banned_receiver_language>`: forbidden ambiguous receiver phrases
11. `<success_criteria>`: checks for vocabulary use

</table_of_contents>

<kinds>

| Kind          | Role                 | Owns                                                                                                                        | Does not own                                                                                      |
| ------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `.substrate`  | Primitive mechanics  | Runtime, process, filesystem, workflow, hook, tool execution, and platform primitives with zero product-domain semantics.   | Product semantics, product records, consumption contracts, or concrete product boundaries.        |
| `.capability` | Reusable behavior    | One reusable product behavior with meaning outside any one consumer.                                                        | A semantic world, concrete rendering, or one-off workflow wording.                                |
| `.domain`     | Bounded semantics    | A bounded semantic context with vocabulary, rules, and invariants other nodes speak.                                        | Primitive mechanics, medium-specific contracts, or concrete rendering.                            |
| `.interface`  | Consumption contract | Resources, verbs, selectors, payload shapes, lifecycle contracts, and error semantics that adapt providers for consumption. | Terminal text, UI layout, command help, or protocol rendering.                                    |
| `.surface`    | Provided boundary    | One concrete outside boundary: CLI, MCP, web API, UI, or agentic interface grammar, rendering, invocation, and protocol.    | Reusable semantics, persistence semantics, verification logic, or backend implementation.         |
| `.outcome`    | Product bet          | A hypothesis that specified output produces measurable behavior change and impact.                                          | Locally verifiable assertions, tests, evals, audits, tier, or per-reference verification results. |

</kinds>

<ordered_kind_decision>

Apply these tests top to bottom. The first matching test fixes the kind:

1. `.outcome`: Is this a genuine bet whose whole output could be replaced while the belief stands, and whose success only real usage can validate?
2. `.substrate`: Does this carry zero product-domain semantics under the transplant test? If moved to an unrelated product, does it keep its full meaning?
3. `.surface`: Is this one concrete outside boundary owning grammar, rendering, invocation, and protocol, with no semantic vocabulary of its own?
4. `.interface`: Is this a medium-agnostic consumption contract with resources, verbs, selectors, payloads, lifecycle, and errors, but no rendering?
5. `.domain`: Does this own a bounded semantic context: vocabulary, rules, and invariants that other nodes speak?
6. `.capability`: This is the floor: one reusable product behavior with meaning outside any one consumer and no semantic world of its own.

Do not classify by who consumes a behavior. Placement follows what the node is.

</ordered_kind_decision>

<kind_order>

The output kinds have this foundational order:

```text
substrate  <  capability  <  domain  <  interface  <  surface
```

A provider is never more outward than the node depending on it. If a substrate appears to depend on a surface, or a capability appears to depend on a domain, resolve the misclassification or inverted dependency before assigning an index.

`.outcome` sits outside the foundational output-kind order. It attaches only to a bet owner: the product root, a `.domain`, a `.surface`, or another `.outcome`.

</kind_order>

<containment>

| Parent        | Admits as child nodes                                |
| ------------- | ---------------------------------------------------- |
| Product root  | Any output kind, `.outcome`                          |
| `.substrate`  | `.substrate`                                         |
| `.capability` | `.substrate`, `.capability`                          |
| `.domain`     | `.substrate`, `.capability`, `.domain`, `.outcome`   |
| `.interface`  | `.substrate`, `.capability`, `.domain`, `.interface` |
| `.surface`    | Any output kind, `.outcome`                          |
| `.outcome`    | Any output kind, `.outcome`                          |

Decision records are files in a node's shared index space, not child nodes.

</containment>

<openings>

The next methodology admits six node kinds, but the current product-root spec-file contract admits only these opening forms:

| Kind         | Current authoring-compatible opening               |
| ------------ | -------------------------------------------------- |
| Output kinds | `PROVIDES ... SO THAT ... CAN ...`                 |
| `.outcome`   | `WE BELIEVE THAT ... WILL ... CONTRIBUTING TO ...` |

Output kinds are `.substrate`, `.capability`, `.domain`, `.interface`, and `.surface`.

Do not invent kind-specific opening verbs while working in this product repository. A future methodology or product-root rule can change the opening contract, but this skill must not teach agents to author files that the current product root rejects.

Provider names in openings are product-language names, never filesystem paths. Structure resolves providers by lower index.

</openings>

<operational_terms>

| Term        | Meaning                                                                                                                                                       | Placement question                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Persistence | Retained product artifacts plus addressing and retention policy: records, journals, snapshots, caches, artifacts, and history.                                | Which node owns the retained artifact's semantics?                |
| Delivery    | Ephemeral projection of a result to an external surface: terminal output, PR comment, UI display, API response, webhook, or observability sink.               | Which node owns the projection contract?                          |
| Backend     | Concrete environment boundary that provides a persistence or delivery contract: local files, Git history, hosted artifacts, platform APIs, or hosted service. | Which node owns the environment-specific implementation contract? |
| Node state  | Evidence-derived standing against declared tier.                                                                                                              | Which node owns lifecycle vocabulary and projection?              |

Persistence, delivery, and backend are reserved terms. They form no extra node kinds.

</operational_terms>

<tier_state_terms>

| Term         | Meaning                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tier         | A declared output-node bar: `prototype`, `experimental`, or `production`. Absent tier defaults to `production`.                                                                             |
| Declared     | Spec exists; no evidence for the node's bar is referenced, and the bar has not passed.                                                                                                      |
| Specified    | Assertion evidence for the node's bar is referenced but does not yet pass.                                                                                                                  |
| Passing      | Current foundation term for a node whose required verification passes.                                                                                                                      |
| Implemented  | Next-methodology term for a node whose required verification for its tier passes; compatible with current `Passing` during migration.                                                       |
| Failing      | A reference with a recorded passing result no longer passes.                                                                                                                                |
| Status claim | `spx.status.json`, the committed machine-written claim carrying state, tier, and per-reference results for output nodes; outcome claims roll up from output children and omit tier/results. |

No product mints additional base node states. Qualified compounds such as run terminal state or journal sealed state specialize another artifact's lifecycle.

</tier_state_terms>

<top_level_projection>

Product top level is product-named nodes carrying role suffixes. Role-named wrapper directories do not exist.

Wrong:

```text
spx/
  NN-enablers.capability/
    spec-tree.capability/
```

Right:

```text
spx/
  NN-spec-tree.capability/
```

</top_level_projection>

<classification_output>

For every concern, record:

| Field              | Meaning                                                                                |
| ------------------ | -------------------------------------------------------------------------------------- |
| Current behavior   | The behavior observed in the current tree or proposed by the product spec.             |
| Current path       | Inventory path, or `new` for not-yet-represented behavior.                             |
| Kind decision      | First matching decision-procedure test.                                                |
| Operational facets | Persistence, delivery, backend, node-state, tier/status-claim impact, or none.         |
| Candidate receiver | Product-named target node with kind suffix, unnumbered until ordering evidence exists. |
| Evidence           | Product spec, decision, spec assertion, implementation fact, or operator statement.    |
| Status             | Active, parked, or unresolved.                                                         |

</classification_output>

<banned_receiver_language>

These phrases are too vague to appear as receivers:

- provider behavior
- semantic owner
- lower target area
- move to spec-tree or persistence or verification, when used as an unresolved multi-target receiver instead of a concrete receiver row with kind, owned behavior, and evidence
- shared logic
- common layer
- materialization, except when quoted as current inventory or when explaining the rename to backend
- enablers bucket, domains bucket, interfaces bucket, surfaces bucket, or any other role-named wrapper directory

Replace each phrase with a product-named receiver carrying one of the six kind suffixes.

</banned_receiver_language>

<success_criteria>

- [ ] Every behavior is classified by the ordered six-kind decision procedure or marked unresolved.
- [ ] Receiver names are product-named target nodes with kind suffixes, not bare roles, buckets, or current holding paths.
- [ ] Outcome, persistence, delivery, backend, node state, tier, and status-claim concerns remain separate in every row.
- [ ] Containment is valid for every parent/child projection.
- [ ] No `.outcome` row carries locally verifiable assertions or tier.

</success_criteria>
