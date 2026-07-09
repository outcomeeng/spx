<objective>
The intermediate view stack used to project target structure without guessing kind, receiver, containment, or dependency order.
</objective>

<views>

| View                          | Required content                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invocation scope              | Scope being projected: whole product tree, current node, migration slice, or note. Include explicit exclusions and whether edits are allowed.                                               |
| Authority                     | Methodology source, product spec, governing decisions, operator statements, status claims, and coordination notes classified by authority level.                                            |
| Product top-level mapping     | When scope is `spx/`, the product spec's intended top-level nodes, kind suffixes, and product-owned placement reasoning.                                                                    |
| Current inventory             | Existing nodes, specs, decisions, status claims, tests, evals, audits, implementation files, and behavior they currently contain. Label every current path as inventory.                    |
| Target vocabulary             | The six kinds, ordered kind decision procedure, containment rules, openings, operational terms, maturity/state vocabulary, and deprecated or ambiguous terms that must not drive placement. |
| Kind decision                 | Each behavior classified by first matching kind: `.outcome`, `.substrate`, `.surface`, `.interface`, `.domain`, `.capability`, parked, or unresolved.                                       |
| Operational concern placement | Persistence, delivery, backend, node state, maturity, and status-claim concerns assigned to the node that owns their semantics or contract.                                                 |
| Receiver                      | Product-named candidate target receivers with kind suffix and owned kind-classified concerns. Receivers stay unnumbered until dependency evidence exists.                                   |
| Containment                   | Parent/child validity for every proposed receiver, including outcome attachment only to product root, `.domain`, `.surface`, or `.outcome`.                                                 |
| Dependency evidence           | Provider-consumer or ordering rows proving any different-index placement from the consumer's dependency question.                                                                           |
| Context visibility            | Lower-index siblings read as constraining context; same-index and higher-index siblings listed but not read as constraints.                                                                 |
| Unordered target projection   | Tree shape using `NN-` or same-index peers. List order carries no ordering claim. Role-bucket wrapper directories are rejected.                                                             |
| Numbered target projection    | Tree shape with indices only where dependency evidence proves order. Unresolved order remains `NN-`.                                                                                        |
| Active migration              | Rows that name current path, receiver, next edit, prerequisite SPX support, and verification route.                                                                                         |
| Parked scope                  | Named areas excluded from the phase with reason and re-entry condition.                                                                                                                     |
| Contradiction                 | Conflicts between methodology, product truth, decisions, notes, status claims, code, and operator direction with a proposed resolution path.                                                |
| Unresolved decision           | Product or methodology decision local evidence cannot settle, with the exact decision owner and pause condition.                                                                            |

</views>

<iteration_rule>

When any upstream view changes, recompute downstream views. Do not patch a final tree, numbered plan, or coordination note from stale downstream views.

</iteration_rule>

<output_contract>

For discussion, output only the views needed for the current question. For edits, record the reviewed views in the conversation before changing files.

</output_contract>

<success_criteria>

- [ ] The projection can be traced from authority through inventory, kind decision, operational placement, receivers, containment, dependency evidence, and context visibility.
- [ ] No current path is presented as a target receiver without a six-kind decision.
- [ ] No role-named wrapper directory appears in the projection.
- [ ] Parked areas include a re-entry condition.
- [ ] Higher-index siblings remain visible as listed, unread context.

</success_criteria>
