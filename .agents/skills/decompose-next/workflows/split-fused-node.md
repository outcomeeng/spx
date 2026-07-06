<required_reading>

Read `${SKILL_DIR}/references/projection-views.md`, `${SKILL_DIR}/references/target-vocabulary.md`, and `${SKILL_DIR}/references/ordering-evidence.md` before proposing split rows.

</required_reading>

<process>

1. Require a concrete fused-node path before reading product files.
2. Invoke `/understand` when the live foundation marker is absent.
3. Invoke `/contextualize <node>` before inspecting node contents.
4. Scope the fused node and explicit exclusions.
5. Build the authority view. Separate methodology source, product truth, operator direction, coordination notes, and current-node evidence.
6. Inventory every behavior inside the node: specs, decisions, tests, implementation, CLI entrypoints, persistence, delivery, and backend mechanics.
7. Build the target vocabulary view for the split. Name terms that apply and terms that must not drive placement.
8. Classify each behavior by target role using `${SKILL_DIR}/references/target-vocabulary.md`.
9. Identify receivers for classified behavior. Use target roles and candidate target names, not vague receiver language.
10. Mark behavior that remains temporarily in the current path as "holding path" with the condition that releases it.
11. Build active split rows for behavior whose receiver is known and whose next edit is local.
12. Build parked rows for behavior whose receiver, prerequisite SPX support, or verification route is missing.
13. Check proposed active rows against ordering evidence when they imply order among target receivers.
14. Build the contradiction view for conflicts between current placement, target roles, durable truth, and coordination notes.

</process>

<output_format>

Return:

| Authority source | Level | Use in split |
| ---------------- | ----- | ------------ |

Target vocabulary:

- <term>: <meaning in this split>

| Current behavior | Current path | Target role | Outcome-bet facet | Persistence/delivery facet | Candidate receiver | Evidence | Status |
| ---------------- | ------------ | ----------- | ----------------- | -------------------------- | ------------------ | -------- | ------ |

| Holding path | Retained behavior | Release condition |
| ------------ | ----------------- | ----------------- |

Then return:

| Active split | Receiver | Next edit | Prerequisite | Verification |
| ------------ | -------- | --------- | ------------ | ------------ |

Then return:

| Parked area | Reason | Re-entry condition |
| ----------- | ------ | ------------------ |

Then return:

| Contradiction | Evidence | Resolution path |
| ------------- | -------- | --------------- |

</output_format>

<success_criteria>

- [ ] Every behavior in the fused node is accounted for.
- [ ] The split includes an authority view that downstream freshness checks can compare.
- [ ] No row uses banned receiver language from `${SKILL_DIR}/references/target-vocabulary.md`.
- [ ] Temporary current-path retention is labeled as a holding path.
- [ ] Active rows have receivers, next edits, prerequisites, and verification routes.

</success_criteria>
