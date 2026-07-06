<required_reading>

Read `${SKILL_DIR}/references/projection-views.md`, `${SKILL_DIR}/references/target-vocabulary.md`, and `${SKILL_DIR}/references/ordering-evidence.md` before deriving a slice.

</required_reading>

<process>

1. Require a reviewed projection or fused-node scope before reading product files.
2. Invoke `/understand` when the live foundation marker is absent.
3. Invoke `/contextualize <scope>` for the concrete node or root scope that owns the slice inputs.
4. Start from reviewed classification, receiver, active migration, parked scope, and contradiction views.
5. If reviewed views do not exist, run `${SKILL_DIR}/workflows/project-target-structure.md` or `${SKILL_DIR}/workflows/split-fused-node.md`, then run `${SKILL_DIR}/workflows/audit-projection.md` before deriving the slice.
6. Check view freshness against the current invocation scope, authority, inventory, classification, and ordering evidence. If any upstream view changed, rerun the projection or split workflow and then rerun `${SKILL_DIR}/workflows/audit-projection.md` before deriving the slice.
7. Select one slice whose receiver is known.
8. Check whether SPX can represent the slice today. Name required support for node types, methodology loading, context loading, validation, status, tests, or refactor tooling.
9. Separate work into declaration, test/evidence, implementation, validation, review, and merge gates.
10. Park every adjacent concern that the slice does not need.
11. Define the verification route with focused commands or required audit/review gates.
12. State the merge-readiness condition.

</process>

<output_format>

Return:

| Slice | Receiver | Current areas touched | Value |
| ----- | -------- | --------------------- | ----- |

| Required SPX support | Present today | Required before implementation |
| -------------------- | ------------- | ------------------------------ |

| Source view | Freshness evidence | Action |
| ----------- | ------------------ | ------ |

| Step | Work | Evidence |
| ---- | ---- | -------- |

| Parked adjacent concern | Re-entry condition |
| ----------------------- | ------------------ |

| Contradiction | Handling in this slice |
| ------------- | ---------------------- |

Merge readiness:

- <condition>

</output_format>

<success_criteria>

- [ ] The slice has one receiver and one reason to exist.
- [ ] Prerequisite SPX capability gaps are named before implementation work.
- [ ] Adjacent concerns are parked with re-entry conditions.
- [ ] Verification and merge-readiness are explicit.

</success_criteria>
