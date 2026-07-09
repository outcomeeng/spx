<objective>
The dependency-evidence matrix and index-assignment rules for target projections.
</objective>

<matrix>

Every different-index claim requires this row:

| Field                 | Required content                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider              | The earlier receiver, decision, or capability whose contract the consumer needs.                                                             |
| Consumer              | The later receiver asking what it depends on.                                                                                                |
| Basis                 | Provider/consumer, logical prerequisite, shared substrate, vertical-slice value delivery, feature extension, or ADR/PDR constraint.          |
| Evidence              | Product spec, decision, spec assertion, test/eval/audit evidence, implementation dependency, validated workflow fact, or operator statement. |
| Consequence if absent | What becomes impossible, invalid, unverifiable, or incoherent without the provider in the consumer's context.                                |
| Kind-order check      | Whether provider kind is same-or-more-foundational than the consumer for output kinds.                                                       |
| Verdict               | Ordered, same-index peer, or unresolved.                                                                                                     |

</matrix>

<index_rules>

- Lower index means provider or governing context.
- Higher index means consumer.
- Same index means independent peer.
- Same-index and higher-index siblings are listed for visibility; only lower-index siblings are read as constraining context.
- Different indices require an ordering-evidence row.
- Same-index peer is the default when no edge is proven.
- Assigning an index asks only the consumer-side question: what does this node depend on?
- Never assign an index by asking what depends on this node. A provider is forbidden to know its consumers.
- The next free number is never a default slot.
- An existing sibling is never precedent. A new sibling shares an existing index unless ordering evidence proves one constrains the other.
- Explanation order, topic grouping, current tree order, roadmap priority, "foundation" language, and role buckets do not prove an edge.
- A current implementation import is evidence to investigate. It does not decide target order by itself.

</index_rules>

<kind_order_guard>

Before assigning an index, check the output-kind order:

```text
substrate  <  capability  <  domain  <  interface  <  surface
```

A provider is never more outward than the node depending on it. If the row would make a more-foundational kind depend on a more-outward kind, stop and resolve kind classification or dependency direction first.

`.outcome` is outside the output-kind order. Its position follows bet ownership and dependency evidence, and it carries no locally verifiable assertions.

</kind_order_guard>

<valid_evidence_bases>

| Basis                         | Meaning                                                                     |
| ----------------------------- | --------------------------------------------------------------------------- |
| provider/consumer             | A later concern consumes a contract from an earlier concern.                |
| logical prerequisite          | A later concern is incoherent without an earlier one.                       |
| vertical-slice value delivery | A later slice extends a delivered earlier slice.                            |
| shared substrate              | Multiple concerns depend on an earlier reusable substrate.                  |
| feature extension             | A later concern extends the contract of an earlier concern.                 |
| ADR/PDR constraint            | An ADR or PDR must be read before a later concern is authored or evaluated. |

</valid_evidence_bases>

<feasibility_questions>

Ask these from the consumer before assigning order:

- Can this consumer be specified without the provider?
- Can this consumer be verified without the provider?
- Can this consumer execute its value without the provider?
- Does this consumer need the provider's spec or decision in context?
- Does this consumer extend a delivered earlier slice?

If all answers are yes and no valid evidence basis applies, keep the pair same-index or unresolved.

</feasibility_questions>

<projection_rule>

Produce:

1. The dependency-evidence matrix.
2. An unordered target projection.
3. A numbered target projection only for proven edges.

Do not emit a numbered tree first.

</projection_rule>

<success_criteria>

- [ ] Every numeric ordering edge is backed by a matrix row.
- [ ] Every matrix row asks the dependency question from the consumer.
- [ ] Every output-kind edge passes the kind-order guard.
- [ ] Unresolved edges stay `NN-` or same-index.
- [ ] The consequence-if-absent cell names an actual failure, not a preference.

</success_criteria>
