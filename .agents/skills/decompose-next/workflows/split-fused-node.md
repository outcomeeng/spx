<required_reading>

Read `${SKILL_DIR}/references/projection-views.md`, `${SKILL_DIR}/references/target-vocabulary.md`, and `${SKILL_DIR}/references/ordering-evidence.md` before proposing split rows.

</required_reading>

<process>

1. Require a concrete fused-node path before reading product files.
2. Invoke `/understand` when the live foundation marker is absent.
3. Invoke `/contextualize <node>` before inspecting node contents.
4. Scope the fused node and explicit exclusions.
5. Build the authority view. Separate methodology source, product truth, operator direction, coordination notes, and current-node evidence.
6. Inventory every behavior inside the node: specs, decisions, status claims, tests, evals, audits, implementation, CLI entrypoints, persistence, delivery, backend mechanics, maturity, and node-state projection.
7. Build the target vocabulary view for the split. Name six-kind terms that apply and terms that must not drive placement.
8. Classify each behavior by ordered kind decision using `${SKILL_DIR}/references/target-vocabulary.md`.
9. Assign operational facets: persistence, delivery, backend, node state, maturity, status claim, or none.
10. Identify receivers for classified behavior. Use product-named target nodes with kind suffixes, not vague receiver language or role buckets.
11. Check proposed parent/child containment and outcome attachment.
12. Mark behavior that remains temporarily in the current path as "holding path" with the condition that releases it.
13. Build active split rows for behavior whose receiver is known and whose next edit is local.
14. Build parked rows for behavior whose receiver, prerequisite SPX support, or verification route is missing.
15. Build ordering-evidence rows for active rows that imply order among target receivers. Mark ordering evidence `N/A` only when the split makes no ordering claim.
16. Build the context visibility view from the ordering evidence. Lower-index siblings are read; same-index and higher-index siblings are listed but not read as constraints.
17. Build the contradiction view for conflicts between current placement, target kinds, durable truth, status claims, and coordination notes.
18. List unresolved decisions. Ask only for product or methodology decisions local evidence cannot settle.

</process>

<verification_gates>

Each gate must report PASS before emitting active split rows. A FAIL stops the split and returns the missing artifact or contradiction.

| Gate                | PASS condition                                                                                                                                                     | FAIL condition                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Scope gate          | Fused-node path, exclusions, and edit mode are named.                                                                                                              | Node path, exclusions, or edit mode are implied or omitted.                                           |
| Authority gate      | Authority view separates methodology source, product truth, operator direction, coordination notes, and current-node evidence.                                     | Any authority class is missing or a coordination note is treated as product truth.                    |
| Inventory gate      | Every observed spec, decision, status claim, test, eval, audit, implementation behavior, CLI entrypoint, persistence, delivery, backend, and state item is listed. | Any behavior inside the fused node is absent from the inventory.                                      |
| Vocabulary gate     | Target vocabulary view names applicable six-kind terms and banned receiver language.                                                                               | A split row uses current placement, role bucket, or undefined receiver language as placement basis.   |
| Kind and facet gate | Every behavior has kind decision and operational facets.                                                                                                           | A behavior lacks kind decision or persistence/delivery/backend/node-state/maturity/status treatment.  |
| Containment gate    | Every proposed receiver relationship has a containment verdict.                                                                                                    | A proposed parent/child lacks containment evidence or violates the containment table.                 |
| Holding-path gate   | Temporarily retained behavior is labeled holding path with release condition.                                                                                      | Retained behavior is described as valid target structure without a release condition.                 |
| Ordering gate       | Any active row that implies ordering has dependency evidence; same-index or unresolved rows stay unordered; no-order splits report `N/A`.                          | A split assigns order without evidence, or omits `N/A` when no ordering claim exists.                 |
| Context gate        | Context visibility lists lower-index constraints and lists same-index and higher-index siblings without treating them as constraints.                              | Same-index or higher-index siblings are read as constraints, or lower-index constraints are unlisted. |
| Completion gate     | Active, parked, and contradiction rows are all present.                                                                                                            | Any row class is missing or contradictions are hidden in prose.                                       |
| Unresolved gate     | Unresolved decisions are listed with owner and pause condition, or marked `N/A`.                                                                                   | Decisions local evidence cannot settle are omitted or hidden in prose.                                |

</verification_gates>

<output_format>

Return:

| Gate | Verdict | Evidence or blocking failure |
| ---- | ------- | ---------------------------- |

| Scope | Exclusions | Edit mode |
| ----- | ---------- | --------- |

| Authority source | Level | Use in split |
| ---------------- | ----- | ------------ |

Target vocabulary:

- <term>: <meaning in this split>

| Current behavior | Current path | Kind decision | Operational facets | Candidate receiver | Evidence | Status |
| ---------------- | ------------ | ------------- | ------------------ | ------------------ | -------- | ------ |

| Parent | Child | Containment verdict | Evidence |
| ------ | ----- | ------------------- | -------- |

| Holding path | Retained behavior | Release condition |
| ------------ | ----------------- | ----------------- |

| Provider | Consumer | Basis | Evidence | Consequence if absent | Kind-order check | Verdict |
| -------- | -------- | ----- | -------- | --------------------- | ---------------- | ------- |

| Context visibility | Status | Evidence |
| ------------------ | ------ | -------- |

Then return:

| Active split | Receiver | Next edit | Prerequisite | Verification |
| ------------ | -------- | --------- | ------------ | ------------ |

Then return:

| Parked area | Reason | Re-entry condition |
| ----------- | ------ | ------------------ |

Then return:

| Contradiction | Evidence | Resolution path |
| ------------- | -------- | --------------- |

Then return:

| Unresolved decision | Owner | Pause condition |
| ------------------- | ----- | --------------- |

</output_format>

<success_criteria>

- [ ] Every behavior in the fused node is accounted for.
- [ ] The split includes scope, exclusions, and edit mode.
- [ ] The split includes an authority view that downstream freshness checks can compare.
- [ ] The verification gates table is reported with PASS/N/A or a blocking FAIL.
- [ ] No row uses banned receiver language from `${SKILL_DIR}/references/target-vocabulary.md`.
- [ ] No `.outcome` receiver carries locally verifiable assertions or maturity.
- [ ] No role-named wrapper receiver appears.
- [ ] Every proposed child satisfies containment.
- [ ] Context visibility is reported.
- [ ] Ordering evidence is reported, or marked `N/A` when the split makes no ordering claim.
- [ ] Temporary current-path retention is labeled as a holding path.
- [ ] Active rows have receivers, next edits, prerequisites, and verification routes.
- [ ] Unresolved decisions are reported, or marked `N/A`.

</success_criteria>
