<required_reading>

Read `${SKILL_DIR}/references/projection-views.md`, `${SKILL_DIR}/references/target-vocabulary.md`, and `${SKILL_DIR}/references/ordering-evidence.md` before producing any tree.

</required_reading>

<process>

1. Require a concrete scope before reading product files: `spx/` for a product-root projection or a full node path for a subtree projection.
2. Invoke `/understand` when the live foundation marker is absent.
3. Invoke `/contextualize <scope>` before inspecting spec-tree files. For `spx/`, load product-root context using the repository's contextualization workflow.
4. Build the invocation scope view. Name the scope, exclusions, and whether the task is discussion-only or may edit files.
5. Build the authority view. Separate methodology, product truth, governing decisions, operator direction, status claims, and coordination notes.
6. When scope is `spx/`, build the product top-level mapping view from the product spec and mark missing product-spec structure as a product-spec gap.
7. Build the current inventory view from the in-scope files. Label every current path as inventory.
8. Build the target vocabulary view. Name the six kinds, operational terms, maturity/state vocabulary, and terms that must not drive placement.
9. Build the kind decision view. Apply the ordered decision procedure before assigning a receiver.
10. Build the operational concern placement view for persistence, delivery, backend, node state, maturity, and status-claim concerns.
11. Build the receiver view. Receivers stay unnumbered and name owned kind-classified concerns. Reject role-named wrapper directories.
12. Build the containment view. Check every proposed parent/child against the six-kind containment table.
13. Build the dependency-evidence view. Record every proposed ordering edge from the consumer's dependency question with basis, evidence, consequence if absent, and kind-order check.
14. Build the context visibility view from the ordering evidence. Lower-index siblings are read; same-index and higher-index siblings are listed but not read as constraints.
15. Produce the unordered target projection. Use `NN-` or same-index peers where order is unresolved.
16. Produce the numbered target projection only for proven edges.
17. Build active migration rows for any next edits the projection makes executable.
18. Build parked scope rows for adjacent concerns excluded from this projection.
19. Build the contradiction view for conflicts between methodology, product truth, coordination notes, status claims, code, and operator direction.
20. List unresolved questions. Ask only for product or methodology decisions local evidence cannot settle.

</process>

<verification_gates>

Each gate must report PASS before moving to the next output phase. A FAIL stops the projection and returns the missing artifact or contradiction.

| Gate                      | PASS condition                                                                                                                                      | FAIL condition                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Scope gate                | Invocation scope names the concrete root or node, exclusions, and whether edits are allowed.                                                        | Scope, exclusions, or edit mode is implied or omitted.                                                 |
| Authority gate            | Authority view separates methodology source, product truth, governing decisions, operator direction, status claims, and coordination notes.         | Any authority class is missing or a coordination note is treated as product truth.                     |
| Vocabulary gate           | Target vocabulary view names six kinds, ordered kind decision, containment, operational terms, and maturity/state/status-claim terms.               | A projection proceeds from role buckets, current path names, or undefined operational terms.           |
| Mapping gate              | For `spx/` scope, product top-level mapping is present; for non-root scope, the gate records `N/A`.                                                 | Root scope lacks product-owned top-level mapping or treats inventory clustering as product placement.  |
| Inventory gate            | Current inventory labels every current path as inventory or holding path.                                                                           | A current path is used as a target receiver before kind decision.                                      |
| Kind and containment gate | Every behavior has a kind-decision row and every proposed parent/child has a containment row.                                                       | Any receiver lacks a kind decision or any child lacks containment evidence.                            |
| Ordering gate             | Every numeric order has a dependency-evidence row with provider, consumer, basis, evidence, consequence if absent, kind-order check, and verdict.   | Any ordered receiver lacks evidence, or a same-index/unresolved relationship receives a numeric order. |
| Context gate              | Context visibility view lists lower-index constraints and lists same-index and higher-index siblings without treating them as constraints.          | Same-index or higher-index siblings are read as constraints, or lower-index constraints are unlisted.  |
| Projection gate           | Unordered projection, numbered projection with status, active migration, parked scope, contradiction, and unresolved-decision sections are present. | Any required projection section is missing, or unresolved decisions mix with facts local files settle. |

</verification_gates>

<output_format>

Return sections in this order:

1. Scope
2. Authority
3. Gate report
4. Inventory summary
5. Target vocabulary
6. Product top-level mapping, when scope is `spx/`
7. Kind decision table
8. Operational concern placement
9. Receiver table
10. Containment
11. Ordering evidence
12. Context visibility
13. Unordered projection
14. Numbered projection with `Ordered`, `Same-index`, `N/A`, or `Unresolved` status
15. Active migration
16. Parked scope
17. Contradictions
18. Unresolved decisions

Gate report:

| Gate | Verdict | Evidence or blocking failure |
| ---- | ------- | ---------------------------- |

</output_format>

<success_criteria>

- [ ] No current holding path is used as a target receiver without a six-kind decision.
- [ ] No role-named wrapper directory appears.
- [ ] The verification gates table is reported with PASS/N/A or a blocking FAIL.
- [ ] Product top-level mapping is present when scope is `spx/`.
- [ ] Every receiver owns named kind-classified concerns.
- [ ] Every proposed child satisfies containment.
- [ ] Context visibility is present and separates constraints from listed siblings.
- [ ] Numbered output exists only where ordering evidence supports it.
- [ ] Unresolved decisions are isolated from facts local files can settle.

</success_criteria>
