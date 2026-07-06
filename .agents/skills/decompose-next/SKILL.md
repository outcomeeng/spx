---
name: decompose-next
description: >-
  ALWAYS invoke this skill when projecting a next-methodology target structure,
  splitting current spec-tree nodes into target roles, auditing a proposed
  target tree, deriving migration slices from a projection, or updating
  coordination notes from reviewed structure views.
allowed-tools:
  - Read
  - Glob
  - Grep
  - Edit
  - Skill
  - Bash(tsx src/cli.ts validation markdown:*)
---

<objective>
Target-structure projection with intermediate views, ordering evidence, and migration rows that distinguish current inventory from target receivers.
</objective>

<essential_principles>

- Current paths are inventory. A current node proves where behavior lives now, never where it belongs in the target structure.
- Target receivers come from the active methodology area roles: substrate, capability, domain, interface, and surface.
- Produce intermediate views before producing a target tree. A tree emitted without scope, authority, inventory, vocabulary, classification, receiver, and dependency-evidence views is unsupported.
- Produce an unordered projection before a numbered projection. Numeric order is a claim about dependency and context reach.
- Assign an index only from an ordering-evidence row. Same-index peers are the default when no edge is proven.
- Keep surfaces thin. A surface owns command, API, UI, or protocol binding; it does not own reusable semantics, persistence, or verification logic.
- Keep persistence, delivery, backend, and node state distinct. Persistence retains records, journals, snapshots, and durable artifacts. Delivery publishes ephemeral projections. Backend implements an adapter. Node state is spec-tree lifecycle standing.
- Treat coordination notes as fallible workflow memory. Plans and issues can inform inventory, but they never decide product truth.

</essential_principles>

<intake>

Input form: `<scope> [intent]`.

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

| Request                                                                         | Workflow                                             |
| ------------------------------------------------------------------------------- | ---------------------------------------------------- |
| "project", "target structure", "post-migration", "what will the tree look like" | `${SKILL_DIR}/workflows/project-target-structure.md` |
| "split", "cut apart", "fused node", "current node"                              | `${SKILL_DIR}/workflows/split-fused-node.md`         |
| "audit", "review projection", "check tree", "is this target view valid"         | `${SKILL_DIR}/workflows/audit-projection.md`         |
| "slice", "next migration", "what can we do now"                                 | `${SKILL_DIR}/workflows/derive-migration-slice.md`   |
| "update PLAN", "coordination note", "write the plan"                            | `${SKILL_DIR}/workflows/update-coordination-note.md` |

After selecting a workflow, read it completely and follow it exactly.

</routing>

<quick_reference>

Projection workflows draw from this shared view catalog. A workflow emits the subset its purpose requires and names unresolved decisions only when local evidence cannot settle them:

1. Invocation scope
2. Authority
3. Current inventory
4. Target vocabulary
5. Concern classification
6. Receiver
7. Dependency evidence
8. Unordered target projection
9. Numbered target projection
10. Active migration
11. Parked scope
12. Contradiction
13. Unresolved decision

</quick_reference>

<reference_index>

All in `${SKILL_DIR}/references/`:

| File                   | Purpose                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `projection-views.md`  | The intermediate views every projection builds and iterates.                          |
| `target-vocabulary.md` | Target-role vocabulary, classification tests, and banned ambiguous receiver language. |
| `ordering-evidence.md` | Dependency-evidence matrix fields, valid ordering bases, and index assignment rules.  |

</reference_index>

<workflows_index>

All in `${SKILL_DIR}/workflows/`:

| Workflow                      | Purpose                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `project-target-structure.md` | Produce a target projection from authority, inventory, classification, and ordering evidence. |
| `split-fused-node.md`         | Classify a current fused node into target roles and active/parked split rows.                 |
| `audit-projection.md`         | Review a proposed projection for unsupported receivers, ordering, and vocabulary confusion.   |
| `derive-migration-slice.md`   | Convert reviewed views into one executable migration slice.                                   |
| `update-coordination-note.md` | Patch `PLAN.md` or `ISSUES.md` from reviewed views without turning coordination into truth.   |

</workflows_index>

<failure_modes>

<failure_mode name="numbered-tree-before-evidence">

Claude emitted a target tree with ordered children before building the dependency-evidence matrix.

Why it failed: list order implied context reach without proving provider/consumer, prerequisite, shared-substrate, vertical-slice, feature-extension, or decision-reach edges.

How to avoid: produce the unordered projection first, then assign indices only where `${SKILL_DIR}/references/ordering-evidence.md` has a row with a concrete consequence if absent.

</failure_mode>

<failure_mode name="current-path-as-target-receiver">

Claude named an existing path such as `spx/23-spec-tree.enabler` as a receiver when projecting the next methodology structure.

Why it failed: the current path was inventory. It did not prove that the node survives as a target receiver.

How to avoid: classify the behavior into substrate, capability, domain, interface, or surface before naming a receiver. When behavior carries an outcome bet, record that as a facet attached to the owning area role. Label current paths as holding paths when they remain only until SPX can represent the target structure.

</failure_mode>

<failure_mode name="coordination-note-edited-before-views">

Claude patched `spx/PLAN.md` from a partially formed projection.

Why it failed: the edit encoded unresolved structure as coordination, giving future readers a plan whose receivers and active scope had not been reviewed.

How to avoid: build and review the classification, receiver, active migration, parked scope, and contradiction views before editing a coordination note.

</failure_mode>

</failure_modes>

<success_criteria>

A decompose-next result is sound when:

- [ ] Current holding paths are labeled as inventory, not target receivers.
- [ ] Every behavior in scope is classified by target role or parked with a re-entry condition.
- [ ] Every target receiver owns a named set of classified concerns.
- [ ] Every numeric order traces to an ordering-evidence row.
- [ ] Unresolved edges stay unordered or same-index rather than guessed.
- [ ] Active migration rows name the current area, receiver, next edit, prerequisite support, and verification route.
- [ ] Coordination-note edits contain only reviewed structure and pending work, not product truth.

</success_criteria>
