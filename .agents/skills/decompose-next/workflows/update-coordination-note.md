<required_reading>

Read `${CLAUDE_SKILL_DIR}/references/projection-views.md`, `${CLAUDE_SKILL_DIR}/references/target-vocabulary.md`, and `${CLAUDE_SKILL_DIR}/references/ordering-evidence.md` before editing a coordination note.

</required_reading>

<process>

1. Require the target note path and the concrete spec-tree scope it describes.
2. Invoke `/understand` when the live foundation marker is absent.
3. Invoke `/contextualize <scope>` for the concrete node or root scope the note describes.
4. Confirm the target note is a coordination artifact, such as `PLAN.md` or `ISSUES.md`.
5. Confirm the relevant intermediate views were reviewed in the conversation.
6. If reviewed views do not exist, rebuild them with `${CLAUDE_SKILL_DIR}/workflows/project-target-structure.md` or `${CLAUDE_SKILL_DIR}/workflows/split-fused-node.md`, then run `${CLAUDE_SKILL_DIR}/workflows/audit-projection.md` before editing.
7. Check view freshness against the current invocation scope, authority, inventory, kind decision, operational placement, receiver, containment, context visibility, ordering evidence, active migration, parked scope, contradiction, and unresolved decision rows. For `spx/` scope, also check product top-level mapping freshness. If any upstream view changed, rerun the projection or split workflow and then rerun `${CLAUDE_SKILL_DIR}/workflows/audit-projection.md` before editing.
8. Pass every pre-mutation gate in `<pre_mutation_gates>` before editing.
9. Remove unsupported target trees, vague receiver language, role-bucket projections, and current-path-as-target claims.
10. Write `PLAN.md` only for pending node steps in work already in flight.
11. Write `ISSUES.md` only for known defects, contradictions, or gaps with settlement triggers.
12. Keep product truth, methodology truth, architecture decisions, top-level structure declarations, and product-local semantic definitions out of coordination notes.
13. Use tables that make the next action executable: current path, target receiver, next edit, prerequisite, and verification.
14. Pass every post-edit gate in `<post_edit_gates>` after editing and before reporting success.

</process>

<pre_mutation_gates>

Each gate must report PASS before the note is edited. A FAIL stops the edit and returns the missing view or contradiction.

| Gate                   | PASS condition                                                                                                                                                                                                                                                                                       | FAIL condition                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Scope gate             | The note path and concrete spec-tree scope are both named.                                                                                                                                                                                                                                           | The note path or scope is implied, omitted, or mismatched.                                                    |
| Authority gate         | Methodology, product truth, decisions, operator direction, and note inputs are separated by authority level.                                                                                                                                                                                         | A note is treated as product truth or a product/architecture decision is missing from the authority view.     |
| View freshness gate    | Reviewed views match the current scope, authority, inventory, kind decisions, operational placement, receiver, containment, context visibility, ordering evidence, active migration, parked scope, contradiction, and unresolved decision rows; `spx/` scope also matches product top-level mapping. | Any upstream view changed after review or was never produced.                                                 |
| Coordination-kind gate | The target artifact is `PLAN.md` or `ISSUES.md`, with content limited to that artifact's purpose.                                                                                                                                                                                                    | The edit would put truth, architecture, product semantics, or long-lived refinement into a coordination note. |
| Audit gate             | `audit-projection` has no blocking findings for the rows being written.                                                                                                                                                                                                                              | A blocking projection finding remains unresolved.                                                             |

</pre_mutation_gates>

<post_edit_gates>

Each gate must report PASS after the note is edited. A FAIL returns the validation output and the note path that needs correction.

| Gate                | PASS condition                                                                                                                                                                      | FAIL condition                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Markdown gate       | `tsx src/cli.ts validation markdown <note-path>` exits 0.                                                                                                                           | Markdown validation fails or is not run after editing.                                          |
| Content gate        | The edited note contains only the coordination rows allowed in `<output_format>` and every active row has current path, target receiver, next edit, prerequisite, and verification. | The note carries unsupported structure claims, product truth, unsupported order, or vague rows. |
| Visible-output gate | The response emits or marks `N/A` for product top-level mapping, dependency evidence, context visibility, active migration, parked scope, contradiction, and unresolved decision.   | The response omits any required view summary or hides it in prose.                              |

</post_edit_gates>

<output_format>

When a gate fails, return:

| Gate | Verdict | Evidence or blocking failure |
| ---- | ------- | ---------------------------- |

Then return only the missing view, contradiction, or validation output needed to resume.

When the edit succeeds, the response contains:

- Gate report table with PASS/N/A for every pre-mutation and post-edit gate
- Edited note path
- Markdown validation command and result
- Product top-level mapping, or `N/A`
- Dependency evidence, or `N/A`
- Context visibility, or `N/A`
- Active migration rows, or `N/A`
- Parked scope rows, or `N/A`
- Contradictions handled in the edit
- Unresolved decisions, owners, and pause conditions

The edited note itself contains only:

- Active scope table
- Parked scope table
- Re-entry conditions
- Verification route
- Settlement triggers for `ISSUES.md` entries
- Pointers to durable truth only when those files already exist

</output_format>

<success_criteria>

- [ ] The note records coordination only.
- [ ] The response reports every pre-mutation and post-edit gate with PASS/N/A or a blocking FAIL.
- [ ] The response emits or marks `N/A` for product top-level mapping, dependency evidence, context visibility, active migration, parked scope, contradiction, and unresolved decision.
- [ ] The response lists contradictions and unresolved decisions, or marks each N/A.
- [ ] The note path passes `tsx src/cli.ts validation markdown <note-path>` after editing.
- [ ] Every active row has a reviewed receiver and executable next edit.
- [ ] The edited note uses reviewed views proven fresh against the current scope and upstream evidence.
- [ ] Parked rows name why they are parked and how they re-enter.
- [ ] `PLAN.md` contains pending in-flight steps only.
- [ ] `ISSUES.md` contains stable defects, contradictions, or gaps with settlement triggers only.
- [ ] No unsupported target tree or numbered order remains.

</success_criteria>
