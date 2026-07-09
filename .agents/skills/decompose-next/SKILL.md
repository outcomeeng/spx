---
name: decompose-next
description: >-
  ALWAYS invoke this skill when projecting a next-methodology target structure,
  splitting current spec-tree nodes into target kinds, auditing a proposed
  target tree, deriving migration slices from a projection, or updating
  coordination notes from reviewed structure views.
argument-hint: "<scope> [intent]"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Edit
  - Skill
  - Bash(tsx src/cli.ts validation markdown:*)
---

<objective>
A decompose-next request routed to its matching projection, split, audit, slice, or coordination-note workflow.
</objective>

<essential_principles>

- Current paths are inventory. A current node proves where behavior lives now, never where it belongs in the target structure.
- Target receivers come from the active methodology node kinds: `.substrate`, `.capability`, `.domain`, `.interface`, `.surface`, and `.outcome`.
- A node's kind, role, and directory suffix are one thing. Do not project role-named wrapper directories such as `enablers.capability/` or `surfaces.surface/` that contain the actual role nodes.
- Classify with the ordered kind decision procedure: outcome, substrate, surface, interface, domain, capability. The first matching kind wins.
- Produce intermediate views before producing a target tree. A tree emitted without scope, authority, inventory, vocabulary, kind decision, receiver, containment, and dependency-evidence views is unsupported.
- Produce an unordered projection before a numbered projection. Numeric order is a claim about dependency and context reach.
- Assign an index only from the consumer-side question: what does this node depend on? Same-index peers are the default when no edge is proven. Existing siblings and current code layout are never precedents.
- Keep surfaces thin. A surface owns one concrete provided boundary: grammar, rendering, invocation, and protocol. A surface that owns semantic vocabulary, rules, or invariants is misclassified.
- Keep outcomes assertion-free. An outcome is a product bet with evidence-of-success measures; locally verifiable assertions live in output-kind children.
- Keep persistence, delivery, backend, and node state distinct. Persistence retains records, journals, snapshots, and durable artifacts. Delivery publishes ephemeral projections. Backend implements an environment boundary. Node state is evidence-derived standing against tier.
- Treat coordination notes as fallible workflow memory. `ISSUES.md` records known defects, contradictions, and gaps with settlement triggers. `PLAN.md` records pending node steps for work already in flight. Neither decides product truth.
- For context projection, lower-index siblings are read as constraints; same-index and higher-index siblings are listed but not read as constraints.

</essential_principles>

<intake>

Input form: `$ARGUMENTS`.

Interpret `$ARGUMENTS` as `<scope> [intent]`. Empty `$ARGUMENTS` means no scope or workflow was supplied; ask for both before reading product files.

When `$ARGUMENTS` names multiple intents, route one workflow at a time in dependency order: project or split first, audit second, derive slice third, update coordination note last. Stop after the first workflow that produces a blocking gate failure or unresolved decision.

When the request does not name a workflow, ask which view to produce:

1. Project target structure
2. Split a fused current node
3. Audit an existing projection
4. Derive a migration slice
5. Update a coordination note

When the request touches `spx/**` content, require a concrete target before routing: `spx/` for product-root projection, a full node path for node work, or a specific coordination-note path. Do not inspect spec-tree files from an unnamed or implied scope.

Wait for response before proceeding.

</intake>

<routing>

| Request                                                                         | Workflow                                                    |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| "project", "target structure", "post-migration", "what will the tree look like" | `${CLAUDE_SKILL_DIR}/workflows/project-target-structure.md` |
| "split", "cut apart", "fused node", "current node"                              | `${CLAUDE_SKILL_DIR}/workflows/split-fused-node.md`         |
| "audit", "review projection", "check tree", "is this target view valid"         | `${CLAUDE_SKILL_DIR}/workflows/audit-projection.md`         |
| "slice", "next migration", "what can we do now"                                 | `${CLAUDE_SKILL_DIR}/workflows/derive-migration-slice.md`   |
| "update PLAN", "update ISSUES", "coordination note", "write the plan"           | `${CLAUDE_SKILL_DIR}/workflows/update-coordination-note.md` |

After selecting a workflow, read it completely and follow it exactly.

</routing>

<quick_reference>

`${CLAUDE_SKILL_DIR}/references/projection-views.md` is the canonical view catalog. Use it as the source of truth.

Before emitting a target tree, migration slice, audit verdict, or coordination-note edit, confirm the workflow emits or marks N/A for these commonly missed views:

- Product top-level mapping when scope is `spx/`
- Dependency evidence
- Context visibility
- Active migration
- Parked scope
- Contradiction and unresolved decision

</quick_reference>

<reference_index>

All in `${CLAUDE_SKILL_DIR}/references/`:

| File                   | Purpose                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `projection-views.md`  | The intermediate views every projection builds and iterates.                       |
| `target-vocabulary.md` | Six-kind vocabulary, ordered kind decision, containment, and banned receiver text. |
| `ordering-evidence.md` | Dependency-evidence matrix fields, valid ordering bases, and index assignment.     |

</reference_index>

<workflows_index>

All in `${CLAUDE_SKILL_DIR}/workflows/`:

| Workflow                      | Purpose                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `project-target-structure.md` | Produce a target projection from authority, inventory, kind decision, and ordering evidence. |
| `split-fused-node.md`         | Classify a current fused node into target kinds and active/parked split rows.                |
| `audit-projection.md`         | Review a proposed projection for unsupported receivers, ordering, and vocabulary confusion.  |
| `derive-migration-slice.md`   | Convert reviewed views into one executable migration slice.                                  |
| `update-coordination-note.md` | Patch `PLAN.md` or `ISSUES.md` from reviewed views without turning coordination into truth.  |

</workflows_index>

<failure_modes>

<failure_mode name="numbered-tree-before-evidence">

Claude emitted a target tree with ordered children before building the dependency-evidence matrix.

Why it failed: list order implied context reach without proving provider/consumer, logical prerequisite, shared substrate, vertical-slice value delivery, feature extension, or ADR/PDR constraint edges.

How to avoid: produce the unordered projection first, then assign indices only where `${CLAUDE_SKILL_DIR}/references/ordering-evidence.md` has a row with a concrete consequence if absent.

</failure_mode>

<failure_mode name="current-path-as-target-receiver">

Claude named an existing path such as `spx/23-spec-tree.enabler` as a receiver when projecting the next methodology structure.

Why it failed: the current path was inventory. It did not prove that the node survives as a target receiver.

How to avoid: classify the behavior through the ordered six-kind decision procedure before naming a receiver. Label current paths as holding paths when they remain only until SPX can represent the target structure.

</failure_mode>

<failure_mode name="role-bucket-projection">

Claude projected role-named wrapper directories such as `enablers.capability/`, `domains.domain/`, or `surfaces.surface/`.

Why it failed: the next methodology forbids role buckets. Top-level nodes are product-named nodes carrying role suffixes.

How to avoid: project product concerns directly as named `.substrate`, `.capability`, `.domain`, `.interface`, `.surface`, or `.outcome` nodes.

</failure_mode>

<failure_mode name="outcome-as-output-node">

Claude placed locally verifiable assertions, tests, evals, or audits on an `.outcome`.

Why it failed: an outcome is a bet, not an output node. Its output lives in output-kind children.

How to avoid: extract the locally verifiable output into a child `.substrate`, `.capability`, `.domain`, `.interface`, or `.surface` node, or reclassify the node when the bet is forced.

</failure_mode>

<failure_mode name="coordination-note-edited-before-views">

Claude patched `spx/PLAN.md` from a partially formed projection.

Why it failed: the edit encoded unresolved structure as coordination, giving future readers a plan whose receivers and active scope had not been reviewed.

How to avoid: build and review the kind decision, receiver, active migration, parked scope, and contradiction views before editing a coordination note.

</failure_mode>

</failure_modes>

<success_criteria>

A decompose-next result is sound when:

- [ ] Current holding paths are labeled as inventory, not target receivers.
- [ ] The output includes the product top-level mapping view when scope is `spx/`.
- [ ] Every behavior in scope is classified by the ordered six-kind decision procedure or parked with a re-entry condition.
- [ ] Every target receiver is a product-named node with one of the six kind suffixes.
- [ ] Every target receiver owns a named set of kind-classified concerns and satisfies containment.
- [ ] The output includes a context visibility view separating lower-index constraints from listed same-index and higher-index siblings.
- [ ] Every numeric order traces to an ordering-evidence row.
- [ ] Unresolved edges stay unordered or same-index rather than guessed.
- [ ] Active migration rows name the current path, receiver, next edit, prerequisite support, and verification route.
- [ ] Coordination-note edits contain only reviewed structure and pending work, not product truth.

</success_criteria>
