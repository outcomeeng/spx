<objective>
The dependency-evidence matrix and index-assignment rules for target projections.
</objective>

<matrix>

Every different-index claim requires this row:

| Field                 | Required content                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Provider              | The earlier receiver, decision, or capability.                                                                                      |
| Consumer              | The later receiver that needs the provider in context.                                                                              |
| Basis                 | Provider/consumer, logical prerequisite, shared substrate, vertical-slice value delivery, feature extension, or ADR/PDR constraint. |
| Evidence              | Operator statement, product spec, decision, spec assertion, test, implementation dependency, or validated workflow fact.            |
| Consequence if absent | What becomes impossible, invalid, unverifiable, or incoherent without the provider.                                                 |
| Verdict               | Ordered, same-index peer, or unresolved.                                                                                            |

</matrix>

<index_rules>

- Lower index means provider or governing context.
- Higher index means consumer.
- Same index means independent peer.
- Different indices require an ordering-evidence row.
- Same-index peer is the default when no edge is proven.
- Explanation order, topic grouping, current tree order, roadmap priority, and "foundation" language do not prove an edge.
- A current implementation import is evidence to investigate. It does not decide target order by itself.

</index_rules>

<feasibility_questions>

Ask these before assigning order:

- Can the consumer be specified without the provider?
- Can the consumer be verified without the provider?
- Can the consumer execute its value without the provider?
- Does the consumer need the provider's spec or decision in context?
- Does a vertical slice reach users without the provider?

If all answers are yes and no other evidence basis applies, keep the pair same-index or unresolved.

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
- [ ] Unresolved edges stay `NN-` or same-index.
- [ ] The consequence-if-absent cell names an actual failure, not a preference.

</success_criteria>
