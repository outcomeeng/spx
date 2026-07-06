<required_reading>

Read `${SKILL_DIR}/references/projection-views.md`, `${SKILL_DIR}/references/target-vocabulary.md`, and `${SKILL_DIR}/references/ordering-evidence.md` before editing a coordination note.

</required_reading>

<process>

1. Require the target note path and the concrete spec-tree scope it describes.
2. Invoke `/understand` when the live foundation marker is absent.
3. Invoke `/contextualize <scope>` for the concrete node or root scope the note describes.
4. Confirm the target note is a coordination artifact, such as `PLAN.md` or `ISSUES.md`.
5. Confirm the relevant intermediate views were reviewed in the conversation.
6. If reviewed views do not exist, rebuild them with `${SKILL_DIR}/workflows/project-target-structure.md` or `${SKILL_DIR}/workflows/split-fused-node.md`, then run `${SKILL_DIR}/workflows/audit-projection.md` before editing.
7. Check view freshness against the current invocation scope, authority, inventory, classification, and ordering evidence. If any upstream view changed, rerun the projection or split workflow and then rerun `${SKILL_DIR}/workflows/audit-projection.md` before editing.
8. Remove unsupported target trees, vague receiver language, and current-path-as-target claims.
9. Write only pending work, active split rows, parked scope, re-entry conditions, and verification routes.
10. Keep product truth, methodology truth, and architecture decisions out of the coordination note.
11. Use tables that make the next action executable: current area, target receiver, next edit, prerequisite, and verification.
12. Validate the edited Markdown with the repository's current-source validation command. In this product, run `tsx src/cli.ts validation markdown <note-path>` rather than a globally installed `spx` binary.

</process>

<output_format>

The edited note contains:

- Active scope table
- Parked scope table
- Re-entry conditions
- Verification route
- Pointers to durable truth only when those files already exist

</output_format>

<success_criteria>

- [ ] The note records coordination only.
- [ ] Every active row has a reviewed receiver and executable next edit.
- [ ] The edited note uses reviewed views proven fresh against the current scope and upstream evidence.
- [ ] Parked rows name why they are parked and how they re-enter.
- [ ] No unsupported target tree or numbered order remains.

</success_criteria>
