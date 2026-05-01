# spx/ Directory Guide (Spec Tree)

This guide explains the `spx/` directory structure and how to work with specification trees.

Spec tree management is handled by the **spec-tree** Claude Code plugin (`outcomeeng/claude/plugins/spec-tree`). Use its skills for all spec operations:

| Skill                        | Purpose                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| `/spec-tree:understanding`   | Load methodology foundation (node types, ordering, assertions) |
| `/spec-tree:contextualizing` | Load context for a specific work item                          |
| `/spec-tree:authoring`       | Create specs, ADRs, PDRs, enablers, outcomes                   |
| `/spec-tree:decomposing`     | Break nodes into children with proper ordering                 |
| `/spec-tree:testing`         | Manage spec-test lock file lifecycle                           |
| `/spec-tree:refactoring`     | Restructure the spec tree                                      |
| `/spec-tree:aligning`        | Review for gaps, contradictions, and consistency               |

Additional skills ship with the plugin and are invoked by name: `applying`, `committing-changes`, `interviewing`, `auditing-tests`, `auditing-product-decisions`, `handing-off`, `picking-up`, `refocusing`, `bootstrapping`. See `outcomeeng/claude/plugins/spec-tree/skills/` for the full list.

The `specs/` directory uses the legacy task-driven system and is **frozen**.

---

## Structure Overview

The `spx/` tree is the always-current map of the product. Nothing moves because work is "done" — status is derived from tests.

Two node types exist: **enablers** (infrastructure) and **outcomes** (user-behavior hypotheses). Pre-methodology subtrees still carry non-methodology suffixes and are tracked for migration in [`spx/ISSUES.md`](ISSUES.md).

```text
spx/
  {product}.product.md                # Product requirements
  NN-{slug}.pdr.md                    # Product decisions
  NN-{slug}.adr.md                    # Architectural decisions
  NN-{slug}.{enabler|outcome}/
    {slug}.md                         # Spec file (no type suffix, no numeric prefix)
    tests/
      <subject>.<evidence>.<level>[.<runner>].test.ts
      test_<subject>.<evidence>.<level>.py
      <subject>.<evidence>.<level>[.<runner>].rs
    PLAN.md                           # Escape hatch: deferred plan (ephemeral, not spec tree)
    ISSUES.md                         # Escape hatch: known issues (ephemeral, not spec tree)
    NN-{slug}.adr.md                  # Decisions scoped to this subtree
    NN-{slug}.{enabler|outcome}/      # Nested children
```

---

## Key Principles

1. **Durable map**: Specs stay in place. Nothing moves because work is "done."
2. **Co-location**: Tests live with their spec in `tests/`. No graduation.
3. **Truth flows down**: PDR/ADR → Spec → Test → Code. When layers disagree, the lower layer is in violation.
4. **Two node types**: Enablers (infrastructure, `PROVIDES ... SO THAT ... CAN ...`) and outcomes (hypothesis, `WE BELIEVE THAT ... WILL ... CONTRIBUTING TO ...`). No other node types exist.
5. **Nesting rule**: Outcomes may contain enablers and outcomes. **Enablers contain only enablers** — never outcome children. If a child under an enabler has genuine uncertainty about which output achieves a behavior change, the parent is mis-typed.
6. **Atemporal voice**: Specs state product truth. Never narrate history or reference time.

---

## Status Determination

A node's state is derived from its spec and tests:

| State         | Condition                                         | Required Action                              |
| ------------- | ------------------------------------------------- | -------------------------------------------- |
| **Declared**  | Spec exists, no tests                             | Write tests                                  |
| **Specified** | Spec and tests exist, implementation doesn't yet  | Implement (tests excluded via `spx/EXCLUDE`) |
| **Failing**   | Spec, tests, and implementation exist; tests fail | Fix code                                     |
| **Passing**   | Spec, tests, and implementation exist; tests pass | None                                         |

Specified and failing are normal states — not problems to fix urgently. The spec leads; the code follows.

---

## Sparse Integer Ordering

Numeric prefixes on directories and decision files encode **dependency order** within each directory. A lower-index item constrains every sibling with a higher index and that sibling's descendants. Same index means independent.

- Lower index → dependency (others may rely on it)
- Same index → independent of each other (all depend on the previous lower index)
- Range `[10, 99]`; start at 21 to leave insertion room
- Insert between existing indices at the midpoint (`(21 + 32) / 2 = 26`)
- When integer gaps are exhausted, use **fractional indexing** as an escape hatch (`21.5-…`). Avoid when possible

```text
16-core-config.enabler/             ← Built first (shared config)
36-session.enabler/                 ← Depends on core config
41-validation.enabler/              ← Independent of 46-claude
46-claude.outcome/                  ← Independent of 41-validation (same-range siblings)
```

**ALWAYS use full path when referencing work items:**

| Wrong                  | Correct                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| "session-identity"     | "36-session.enabler/32-session-identity.enabler"                   |
| "implement validation" | "implement 41-validation.enabler/32-typescript-validation.enabler" |

---

## When to Invoke Skills

### Before Implementing ANY Work Item → `/spec-tree:contextualizing`

**BLOCKING REQUIREMENT**

**Trigger conditions:**

- User says "implement X", "work on X", or references a node by its path
- User references a work item file
- You're about to write implementation code

**What it does**: Walks the tree from product root to target node, collecting ancestor specs and context.

### When Creating/Organizing Specs → `/spec-tree:authoring`

**BLOCKING REQUIREMENT**

**Trigger conditions:**

- User says "create a PDR", "add an ADR", "create an enabler", "create an outcome"
- You need templates or ordering rules

**What it does**: Provides templates, sparse integer ordering, structure guidance.

### When Asking "What's Next?" → `/spec-tree:contextualizing`

Use contextualizing to understand current state, then authoring or testing to act on it.

---

## Quick Reference: Skill Selection

| User Says...              | Invoke                       | Do NOT                     |
| ------------------------- | ---------------------------- | -------------------------- |
| "Implement &lt;node&gt;"  | `/spec-tree:contextualizing` | Read the spec directly     |
| "Create a PDR"            | `/spec-tree:authoring`       | Search for templates       |
| "What's next?"            | `/spec-tree:contextualizing` | Grep for work items        |
| "Create an enabler"       | `/spec-tree:authoring`       | Calculate indices yourself |
| "Break this down"         | `/spec-tree:decomposing`     | Guess child structure      |
| "Anything contradictory?" | `/spec-tree:aligning`        | Skim specs manually        |

---

## Test Naming Convention

Test filenames encode the subject, evidence mode, and execution level:

```text
<subject>.<evidence>.<level>[.<runner>].test.ts
test_<subject>.<evidence>.<level>.py
<subject>.<evidence>.<level>[.<runner>].rs
```

| Segment  | Values                                                                    | Meaning                         |
| -------- | ------------------------------------------------------------------------- | ------------------------------- |
| evidence | `scenario`, `mapping`, `conformance`, `property`, `compliance`            | The proof the test provides     |
| level    | `l1`, `l2`, `l3`                                                          | Execution pain and dependencies |
| runner   | Optional runner qualifier such as `vitest`, `playwright`, or `subprocess` | Tool-specific disambiguation    |

Execution level describes operational cost and environment dependence. Evidence mode describes the claim the test proves. Runner names describe the tool that executes the test.

---

## Spec-Test Contract

Nodes carry typed assertions with inline evidence links.

```markdown
## Assertions

### Scenarios

- Given a valid config, when parsed, then fields are extracted ([test](tests/parsing.scenario.l1.test.ts))

### Properties

- Parsing is deterministic: same input always produces same output ([test](tests/parsing.property.l1.test.ts))

### Compliance

- NEVER: accept paths with traversal sequences ([test](tests/parsing.compliance.l1.test.ts))
```

**Five assertion types:**

- **Scenario** — "there exists" (this specific case works). Example-based tests.
- **Mapping** — "for all" over a finite, enumerable set. Parameterized tests.
- **Conformance** — output must match an external schema, standard, or reference. Tool-based validation.
- **Property** — "for all" over a type or value space (invariant always holds). Property-based tests.
- **Compliance** — ALWAYS/NEVER behavioral rules from a decision or semantic constraint. Test or review.

**Two evidence mechanisms:** `[test]` (automated test exercises the behavior) and `[review]` (semantic constraint verified by human or agent judgment). See `/spec-tree:understanding` for full details.

---

## Session Management

Claude Code session handoffs are stored in `.spx/sessions/` (separate from spec tree):

```text
.spx/sessions/
├── todo/          # Available for pickup
├── doing/         # Currently claimed
└── archive/       # Completed sessions
```

Use `spx session handoff` to create and `spx session pickup` to claim (see the top-level `CLAUDE.md` for full CLI usage). The `/spec-tree:handing-off` and `/spec-tree:picking-up` skills drive the same lifecycle from within a conversation.
