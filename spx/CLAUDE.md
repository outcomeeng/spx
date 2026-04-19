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

The `specs/` directory uses the legacy task-driven system and is **frozen**.

---

## Structure Overview

The `spx/` tree is the always-current map of the product. Nothing moves because work is "done" — status is derived from tests.

Two node types exist: **enablers** (infrastructure) and **outcomes** (user-behavior hypotheses). Three legacy subtrees still use pre-methodology suffixes (`.capability`, `.feature`, `.story`) — see `spx/ISSUES.md`.

```text
spx/
  {product}.product.md                # Product requirements (MISSING — see ISSUES.md)
  NN-{slug}.pdr.md                    # Product decisions (interleaved)
  NN-{slug}.adr.md                    # Architectural decisions (interleaved)
  NN-{slug}.{enabler|outcome}/
    {slug}.md                         # Spec file (no type suffix, no numeric prefix)
    tests/
      *.{unit,integration,e2e}.test.{ts,py}
    PLAN.md                           # Escape hatch: deferred plan (optional)
    ISSUES.md                         # Escape hatch: known issues (optional)
    NN-{slug}.adr.md                  # Decisions scoped to this subtree
    NN-{slug}.{enabler|outcome}/      # Nested children
```

**Legacy subtrees** (pre-methodology — structural normalization deferred):

```text
NN-{slug}.capability/               # → will become .enabler or .outcome
  {slug}.capability.md              # Legacy: type suffix in spec filename
  NN-{slug}.feature/
    NN-{slug}.story/
```

---

## Key Principles

1. **Durable map**: Specs stay in place. Nothing moves because work is "done."
2. **Co-location**: Tests live with their spec in `tests/`. No graduation.
3. **Truth flows down**: PDR/ADR → Spec → Test → Code. When layers disagree, the lower layer is in violation.
4. **Two node types**: Enablers (infrastructure, `PROVIDES ... SO THAT ... CAN ...`) and outcomes (hypothesis, `WE BELIEVE THAT ... WILL ... CONTRIBUTING TO ...`). No other node types exist.
5. **Atemporal voice**: Specs state product truth. Never narrate history or reference time.

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

**Note:** `31-spec-domain.capability` specifies an `outcomes.yaml` blob-based ledger with additional states (Unknown, Pending, Stale, Regressed). That system is not yet implemented. The states above are the current methodology.

---

## BSP = Binary Space Partitioning

**Binary Space Partitioning (BSP)** encodes dependency order: lower BSP items are dependencies that higher-BSP items may rely on; same BSP means independent. The "binary" refers to insertion by halving available space.

- Lower BSP → dependency (others may rely on it)
- Same BSP → independent of each other
- Use `@` for recursive insertion when integers exhausted (e.g., `20@54-audit`)

```text
16-core-config.enabler/             ← Built first (shared config)
36-session.enabler/                 ← Depends on core config
41-validation.enabler/              ← Can parallel with 46-claude
46-claude.outcome/                  ← Same BSP range = parallel safe
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

- User says "implement story-NN", "work on feature-NN", or "build capability-NN"
- User references a work item file
- You're about to write implementation code

**What it does**: Walks the tree from product root to target node, collecting ancestor specs and context.

### When Creating/Organizing Specs → `/spec-tree:authoring`

**BLOCKING REQUIREMENT**

**Trigger conditions:**

- User says "create a PRD", "add an ADR", "create capability/feature/story"
- You need templates or ordering rules

**What it does**: Provides templates, sparse integer ordering, structure guidance.

### When Asking "What's Next?" → `/spec-tree:contextualizing`

Use contextualizing to understand current state, then authoring or testing to act on it.

---

## Quick Reference: Skill Selection

| User Says...              | Invoke                       | Do NOT                 |
| ------------------------- | ---------------------------- | ---------------------- |
| "Implement story-21"      | `/spec-tree:contextualizing` | Read story.md directly |
| "Create a PRD"            | `/spec-tree:authoring`       | Search for templates   |
| "What's next?"            | `/spec-tree:contextualizing` | Grep for work items    |
| "Create a feature"        | `/spec-tree:authoring`       | Calculate BSP yourself |
| "Break this down"         | `/spec-tree:decomposing`     | Guess child structure  |
| "Anything contradictory?" | `/spec-tree:aligning`        | Skim specs manually    |

---

## Test Naming Convention

Test level is in the filename suffix:

| Level       | Suffix                       | What It Tests                                      |
| ----------- | ---------------------------- | -------------------------------------------------- |
| Unit        | `*.unit.test.{ts,py}`        | Pure logic, no external dependencies               |
| Integration | `*.integration.test.{ts,py}` | Real dependencies (databases, binaries, harnesses) |
| E2E         | `*.e2e.test.{ts,py}`         | Complete user workflows, real credentials          |

**Any test level can exist at any container level.** A capability may have unit tests; a story may have integration tests. The level describes what KIND of test, not where it lives.

---

## Spec-Test Contract

**Current methodology** (enabler/outcome nodes): Typed assertions with inline evidence links.

```markdown
## Assertions

### Scenarios

- Given a valid config, when parsed, then fields are extracted ([test](tests/parsing.unit.test.ts))

### Properties

- Parsing is deterministic: same input always produces same output ([test](tests/parsing.unit.test.ts))

### Compliance

- NEVER: accept paths with traversal sequences ([test](tests/parsing.unit.test.ts))
```

Five assertion types: Scenario, Mapping, Conformance, Property, Compliance. Three evidence mechanisms: `[test]`, `[enforce]`, `[review]`. See `/spec-tree:understanding` for details.

**Legacy format** (capability/feature/story nodes): Gherkin scenarios with Test Files tables — still present in `21-core-cli.capability/`, `26-scoped-cli.capability/`, `31-spec-domain.capability/`.

---

## Session Management

Claude Code session handoffs are stored in `.spx/sessions/` (separate from spec tree):

```text
.spx/sessions/
├── todo/          # Available for /pickup
├── doing/         # Currently claimed
└── archive/       # Completed sessions
```

Use `/handoff` to create, `/pickup` to claim.
