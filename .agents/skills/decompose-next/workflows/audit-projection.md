<required_reading>

Read `${SKILL_DIR}/references/projection-views.md`, `${SKILL_DIR}/references/target-vocabulary.md`, and `${SKILL_DIR}/references/ordering-evidence.md` before auditing a projection.

</required_reading>

<process>

1. Require the projection's concrete scope before reading product files.
2. Invoke `/understand` when the live foundation marker is absent.
3. Invoke `/contextualize <scope>` for the concrete node or root scope the projection claims.
4. Identify the projection being audited and its claimed scope.
5. Check whether the projection includes the required upstream views: authority, inventory, vocabulary, classification, receivers, dependency evidence, active migration, parked scope, and contradiction.
6. Flag current holding paths presented as target receivers.
7. Flag target receivers that do not map to substrate, capability, domain, interface, or surface.
8. Flag vague receiver language listed in `${SKILL_DIR}/references/target-vocabulary.md`.
9. Check every numeric order against a dependency-evidence row.
10. Flag surface nodes that own reusable semantics, persistence, backend implementation, or verification logic.
11. Flag outcome-bet, persistence, delivery, backend, and node-state confusion.
12. Produce corrected intermediate views for the smallest area needed to resolve each finding.

</process>

<output_format>

Lead with findings:

| Severity | Finding | Evidence | Required correction |
| -------- | ------- | -------- | ------------------- |

Then provide corrected views:

- Corrected classification rows
- Corrected receiver rows
- Corrected ordering-evidence rows
- Corrected active migration rows
- Corrected parked scope rows
- Corrected contradiction rows
- Unresolved decisions

</output_format>

<success_criteria>

- [ ] Every finding cites the violated view or vocabulary rule.
- [ ] Corrections are expressed as intermediate views, not only prose.
- [ ] Unsupported numbered order is removed or backed by evidence.

</success_criteria>
