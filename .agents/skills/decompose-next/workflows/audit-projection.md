<required_reading>

Read `${CLAUDE_SKILL_DIR}/references/projection-views.md`, `${CLAUDE_SKILL_DIR}/references/target-vocabulary.md`, and `${CLAUDE_SKILL_DIR}/references/ordering-evidence.md` before auditing a projection.

</required_reading>

<process>

1. Require the projection's concrete scope before reading product files.
2. Invoke `/understand` when the live foundation marker is absent.
3. Invoke `/contextualize <scope>` for the concrete node or root scope the projection claims.
4. Identify the projection being audited and its claimed scope.
5. Check whether the projection includes the required upstream views: invocation scope, authority, inventory, vocabulary, kind decision, operational placement, receivers, containment, context visibility, dependency evidence, active migration, parked scope, contradiction, and unresolved decision.
6. For `spx/` projections, check whether the projection includes product top-level mapping from the product spec.
7. Flag current holding paths presented as target receivers.
8. Flag target receivers that do not map to `.substrate`, `.capability`, `.domain`, `.interface`, `.surface`, or `.outcome`.
9. Flag vague receiver language listed in `${CLAUDE_SKILL_DIR}/references/target-vocabulary.md`.
10. Flag role-named wrapper directories such as enablers, domains, interfaces, or surfaces buckets.
11. Flag projections that read same-index or higher-index siblings as constraints instead of listing them as unread visibility.
12. Check every numeric order against a dependency-evidence row built from the consumer's dependency question.
13. Flag output-kind ordering that violates the kind-order guard.
14. Flag invalid containment.
15. Flag surface nodes that own semantic vocabulary, reusable semantics, persistence semantics, backend implementation, or verification logic.
16. Flag `.outcome` nodes that own locally verifiable assertions, tests, evals, audits, tier, or per-reference status results.
17. Flag persistence, delivery, backend, node-state, tier, and status-claim confusion.
18. Flag state vocabulary outside Declared, Specified, Passing, Implemented, and Failing unless it is a qualified compound for another artifact lifecycle.
19. Produce corrected intermediate views for the smallest area needed to resolve each finding.

</process>

<verification_gates>

Each gate must report PASS before emitting an approval. A FAIL creates a `BLOCKING` finding.

| Gate                 | PASS condition                                                                                                                  | FAIL condition                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Scope gate           | Projection scope is concrete and contextualized.                                                                                | Scope is implied, stale, or lacks contextualization.                                                            |
| Required-views gate  | Projection includes all views required for its scope, including product top-level mapping for `spx/` scope.                     | A required view is absent or stale.                                                                             |
| Vocabulary gate      | Receivers use only valid kind suffixes and avoid banned receiver language.                                                      | Current paths, role buckets, vague receivers, or invalid suffixes drive placement.                              |
| Ordering gate        | Every numeric order has a canonical dependency-evidence row from the consumer dependency question.                              | Any numeric order lacks evidence or uses a basis outside `${CLAUDE_SKILL_DIR}/references/ordering-evidence.md`. |
| Kind-order gate      | Output-kind dependency direction is same-or-more-foundational provider to consumer.                                             | A more outward kind is treated as provider for a more foundational kind.                                        |
| Containment gate     | Every proposed child satisfies the containment table.                                                                           | Any parent/child pair violates or lacks containment evidence.                                                   |
| Surface/outcome gate | Surfaces avoid semantic ownership and outcomes avoid locally verifiable assertions, tier, and per-reference results.            | A surface owns domain/capability/interface behavior, or an outcome owns output-node verification.               |
| State/facet gate     | Persistence, delivery, backend, node state, tier, and status-claim concerns are separated and use the defined state vocabulary. | Operational facets are mixed, or state vocabulary is minted outside defined base states.                        |
| Correction gate      | Every finding has corrected intermediate-view rows or an unresolved decision owner.                                             | Corrections are prose-only, absent, or hide decisions local evidence cannot settle.                             |

</verification_gates>

<severity_contract>

- `BLOCKING`: The projection violates target vocabulary, required views, containment, ordering evidence, authority, context visibility, operational-facet separation, or output format in a way that can misdirect the next edit.
- `DEBT`: The projection is directionally executable but would be harder to reuse, audit, or maintain without a non-blocking cleanup.

Approval requires zero `BLOCKING` findings.

</severity_contract>

<output_format>

Lead with findings:

| Severity | Finding | Evidence | Required correction |
| -------- | ------- | -------- | ------------------- |

Then return:

| Gate | Verdict | Evidence or blocking failure |
| ---- | ------- | ---------------------------- |

Then provide corrected views:

- Corrected scope rows
- Corrected authority rows
- Corrected inventory rows
- Corrected target-vocabulary rows
- Corrected kind-decision rows
- Corrected operational-placement rows
- Corrected receiver rows
- Corrected containment rows
- Corrected context-visibility rows
- Corrected product top-level mapping rows, when scope is `spx/`
- Corrected ordering-evidence rows
- Corrected active migration rows
- Corrected parked scope rows
- Corrected contradiction rows
- Unresolved decisions

</output_format>

<success_criteria>

- [ ] Every finding cites the violated view or vocabulary rule.
- [ ] Every verification gate is reported with PASS/N/A or a `BLOCKING` finding.
- [ ] Findings use only `BLOCKING` or `DEBT`.
- [ ] Corrections are expressed as intermediate views, not only prose.
- [ ] Corrected output has slots for every view class that can produce a finding.
- [ ] Unsupported numbered order is removed or backed by evidence.
- [ ] Role buckets, outcome assertions, invalid containment, and surface/domain confusion are explicitly checked.

</success_criteria>
