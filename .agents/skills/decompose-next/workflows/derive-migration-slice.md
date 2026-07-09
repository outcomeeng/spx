<required_reading>

Read `${SKILL_DIR}/references/projection-views.md`, `${SKILL_DIR}/references/target-vocabulary.md`, and `${SKILL_DIR}/references/ordering-evidence.md` before deriving a slice.

</required_reading>

<process>

1. Require a reviewed projection or fused-node scope before reading product files.
2. Invoke `/understand` when the live foundation marker is absent.
3. Invoke `/contextualize <scope>` for the concrete node or root scope that owns the slice inputs.
4. Start from reviewed kind decision, operational placement, receiver, containment, dependency evidence, context visibility, active migration, parked scope, contradiction, and unresolved-decision views. Include product top-level mapping for `spx/` scope.
5. If reviewed views do not exist, run `${SKILL_DIR}/workflows/project-target-structure.md` or `${SKILL_DIR}/workflows/split-fused-node.md`, then run `${SKILL_DIR}/workflows/audit-projection.md` before deriving the slice.
6. Check view freshness against the current invocation scope, authority, inventory, kind decision, operational placement, receiver, containment, dependency evidence, context visibility, ordering evidence, active migration, parked scope, contradiction, and unresolved-decision views. For `spx/` scope, also check product top-level mapping freshness. If any upstream view changed, rerun the projection or split workflow and then rerun `${SKILL_DIR}/workflows/audit-projection.md` before deriving the slice.
7. Select one slice whose receiver is known.
8. Check whether SPX can represent the slice today. Name required support for suffix admission, authoring, validation, context loading, status projection, status claims, maturity, test/eval/audit discovery, rendering, and refactor tooling.
9. Separate work into declaration, evidence, implementation, validation, audit/review, status-claim, and merge gates.
10. Park every adjacent concern that the slice does not need.
11. Define the verification route with focused commands or required audit/review gates.
12. List unresolved decisions. Ask only for product or methodology decisions local evidence cannot settle.
13. State the merge-readiness condition.

</process>

<verification_gates>

Each gate must report PASS before returning a migration slice. A FAIL stops slice derivation and returns the missing artifact or contradiction.

| Gate               | PASS condition                                                                                                                                                                                                                                                                                        | FAIL condition                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Input gate         | Reviewed projection or fused-node scope is named.                                                                                                                                                                                                                                                     | The slice starts from unreviewed notes, memory, or an implied scope.                    |
| Freshness gate     | Source view freshness table covers authority, inventory, kind decision, operational placement, receiver, containment, dependency evidence, context visibility, ordering evidence, active migration, parked scope, contradiction, unresolved decision, and product top-level mapping for `spx/` scope. | Any source view is stale, missing, or mismatched to the current scope.                  |
| Receiver gate      | The slice has one receiver, one reason to exist, and a kind/containment verdict.                                                                                                                                                                                                                      | The slice combines multiple receivers or lacks kind/containment evidence.               |
| Support gate       | Required SPX support table covers suffix admission, authoring, validation, context loading, status projection, status claims, maturity, evidence discovery, rendering, and refactor tooling.                                                                                                          | A relevant support area is omitted or represented as present without evidence.          |
| Scope-control gate | Parked adjacent concerns are listed with re-entry conditions.                                                                                                                                                                                                                                         | Adjacent concerns remain implicit or are mixed into the slice.                          |
| Verification gate  | Verification route names focused commands or required audit/review gates, plus merge-readiness conditions.                                                                                                                                                                                            | Verification is generic, missing, or disconnected from touched files and node evidence. |
| Contradiction gate | Contradictions are listed with handling for this slice.                                                                                                                                                                                                                                               | Contradictions are embedded in prose or deferred without owner and condition.           |

</verification_gates>

<output_format>

Return:

| Gate | Verdict | Evidence or blocking failure |
| ---- | ------- | ---------------------------- |

| Slice | Receiver | Current areas touched | Value |
| ----- | -------- | --------------------- | ----- |

| Required SPX support | Present today | Required before implementation |
| -------------------- | ------------- | ------------------------------ |

| Source view | Freshness evidence | Action |
| ----------- | ------------------ | ------ |

| Kind/containment check | Verdict | Evidence |
| ---------------------- | ------- | -------- |

| Context visibility check | Verdict | Evidence |
| ------------------------ | ------- | -------- |

| Gate class     | Work | Evidence |
| -------------- | ---- | -------- |
| Declaration    |      |          |
| Evidence       |      |          |
| Implementation |      |          |
| Validation     |      |          |
| Audit/review   |      |          |
| Status claim   |      |          |
| Merge          |      |          |

| Parked adjacent concern | Re-entry condition |
| ----------------------- | ------------------ |

| Contradiction | Handling in this slice |
| ------------- | ---------------------- |

| Unresolved decision | Owner | Pause condition |
| ------------------- | ----- | --------------- |

Merge readiness:

- <condition>

</output_format>

<success_criteria>

- [ ] The slice has one receiver and one reason to exist.
- [ ] The verification gates table is reported with PASS/N/A or a blocking FAIL.
- [ ] Prerequisite SPX capability gaps are named before implementation work.
- [ ] Suffix admission, context loading, maturity, and status-claim impacts are named when relevant.
- [ ] Adjacent concerns are parked with re-entry conditions.
- [ ] Declaration, evidence, implementation, validation, audit/review, status-claim, and merge gate classes are explicit.
- [ ] Unresolved decisions are isolated from facts local files can settle.
- [ ] Verification and merge-readiness are explicit.

</success_criteria>
