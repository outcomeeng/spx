<objective>
The intermediate view stack used to project target structure without guessing receivers or dependency order.
</objective>

<views>

| View                        | Required content                                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invocation scope            | Scope being projected: whole product tree, target area, current node, or migration slice. Include explicit exclusions.                                                                  |
| Authority                   | Active methodology source, product spec, governing decisions, operator statements, and coordination notes classified by authority level.                                                |
| Current inventory           | Existing nodes, specs, decisions, tests, implementation files, and behavior they currently contain. Label each current path as inventory.                                               |
| Target vocabulary           | Roles and terms available in the target methodology. Include deprecated, ambiguous, or legacy terms that must not drive placement.                                                      |
| Concern classification      | Each current behavior classified by area role: substrate, capability, domain, interface, surface, parked, or unresolved. Record outcome bets as facets attached to an owning area role. |
| Receiver                    | Candidate target receivers with owned classified concerns. Receivers stay unnumbered until dependency evidence exists.                                                                  |
| Dependency evidence         | Provider-consumer or ordering rows proving any different-index placement.                                                                                                               |
| Unordered target projection | Tree shape using `NN-` or same-index peers. List order carries no ordering claim.                                                                                                       |
| Numbered target projection  | Tree shape with indices only where dependency evidence proves order. Unresolved order remains `NN-`.                                                                                    |
| Active migration            | Rows that name current area, receiver, next edit, prerequisite SPX support, and verification route.                                                                                     |
| Parked scope                | Named areas excluded from the phase with reason and re-entry condition.                                                                                                                 |
| Contradiction               | Conflicts between methodology, product truth, current notes, code, and operator direction with a proposed resolution path.                                                              |
| Unresolved decision         | Product or methodology decision local evidence cannot settle, with the exact decision owner and pause condition.                                                                        |

</views>

<iteration_rule>

When any upstream view changes, recompute downstream views. Do not patch a final tree, numbered plan, or coordination note from stale downstream views.

</iteration_rule>

<output_contract>

For discussion, output only the views needed for the current question. For edits, record the reviewed views in the conversation before changing files.

</output_contract>

<success_criteria>

- [ ] The projection can be traced from authority through inventory, classification, receivers, and dependency evidence.
- [ ] No current path is presented as a target receiver without a target-role classification.
- [ ] Parked areas include a re-entry condition.

</success_criteria>
