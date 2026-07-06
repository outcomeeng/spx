<required_reading>

Read `${SKILL_DIR}/references/projection-views.md`, `${SKILL_DIR}/references/target-vocabulary.md`, and `${SKILL_DIR}/references/ordering-evidence.md` before producing any tree.

</required_reading>

<process>

1. Require a concrete scope before reading product files: `spx/` for a product-root projection or a full node path for a subtree projection.
2. Invoke `/understand` when the live foundation marker is absent.
3. Invoke `/contextualize <scope>` before inspecting spec-tree files. For `spx/`, load product-root context using the repository's contextualization workflow.
4. Build the invocation scope view. Name the scope, exclusions, and whether the task is discussion-only or may edit files.
5. Build the authority view. Separate methodology, product truth, operator direction, and coordination notes.
6. Build the current inventory view from the in-scope files. Label every current path as inventory.
7. Build the target vocabulary view. Name terms that apply and terms that must not drive placement.
8. Build the concern classification view. Classify each behavior before assigning a receiver.
9. Build the receiver view. Receivers stay unnumbered and name owned classified concerns.
10. Build the dependency-evidence view. Record every proposed ordering edge with basis, evidence, and consequence if absent.
11. Produce the unordered target projection. Use `NN-` or same-index peers where order is unresolved.
12. Produce the numbered target projection only for proven edges.
13. Build active migration rows for any next edits the projection makes executable.
14. Build parked scope rows for adjacent concerns excluded from this projection.
15. Build the contradiction view for conflicts between methodology, product truth, coordination notes, code, and operator direction.
16. List unresolved questions. Ask only for product or methodology decisions local evidence cannot settle.

</process>

<output_format>

Return sections in this order:

1. Scope
2. Authority
3. Inventory summary
4. Target vocabulary
5. Classification table
6. Receiver table
7. Ordering evidence
8. Unordered projection
9. Numbered projection, if evidence supports one
10. Active migration
11. Parked scope
12. Contradictions
13. Unresolved decisions

</output_format>

<success_criteria>

- [ ] No current holding path is used as a target receiver without role classification.
- [ ] Every receiver owns named classified concerns.
- [ ] Numbered output exists only where ordering evidence supports it.
- [ ] Unresolved decisions are isolated from facts local files can settle.

</success_criteria>
