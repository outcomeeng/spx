---
template_version: "0.18.15"
template_source: spec-tree
languages: [typescript]
---

# spx/ Directory Guide (Spec Tree)

This guide explains WHEN to invoke spec-tree skills for this product. It is a **router** — the skills contain the HOW.

---

## Structure Overview

The `spx/` directory is the current map of the desired product. It holds decisions, specs, and implemented verification code (tests and evals). It governs executable code and product behavior, including verification infrastructure, deployment, production checks, monitoring, and product features.

Two node types at any depth:

```text
spx/
  {product-slug}.product.md            # Product spec (root)
  NN-{slug}.adr.md                     # Architecture decision
  NN-{slug}.pdr.md                     # Product decision
  NN-{slug}.enabler/                   # Enabler: infrastructure or capability with known output
    {slug}.md                          # Spec file; sufficient for declared state
    tests/                             # Test evidence for assertions
    evals/                             # Eval evidence for assertions
    PLAN.md                            # Coordination note: deferred plan (optional)
    ISSUES.md                          # Coordination note: known issues (optional)
    NN-{slug}.enabler/                 # Children: enablers only
  NN-{slug}.outcome/                   # Outcome: hypothesis whose output is a product bet
    {slug}.md                          # Spec file; states hypothesis and assertions
    tests/                             # Test evidence for assertions
    evals/                             # Eval evidence for assertions
    PLAN.md                            # Coordination note: deferred plan (optional)
    ISSUES.md                          # Coordination note: known issues (optional)
    NN-{slug}.{enabler|outcome}/       # Children: enablers and outcomes
```

Coordination notes (`PLAN.md`, `ISSUES.md`) carry cross-session working context. They are not product truth; verify them before use.

---

## Key Principles

1. **Durable map**: Decisions, spec nodes and their co-located tests, evals and coordination notes stay in place over their entire lifecycle. They are deleted if they are to be removed from the product. This is a completely normal part of the product lifecycle. Imagine an outcome that required several different implementations to achieve the desired user behavior. The no longer enabled features are deleted, their code loses coverage and is garbage collected.
2. **Two node types**: Enabler (infrastructure, output is known) and outcome (hypothesis, output is a bet). Enablers can only contain enabler children. Outcomes can contain both.
3. **Co-location**: Verification (tests and evals) live with their spec in `tests/` and `evals/`.
4. **Atemporal voice**: Specs state product truth. Never narrate history. Any historical context is provided by git history and merge records, never in the Spec Tree.
5. **Deterministic context injection**: The tree structure defines what context gets loaded for work on a target and is injected by the `/contextualizing` skill.
6. **Decision records win by hierarchy**: If a spec contradicts an ADR or PDR in its ancestry, the spec is wrong. Rewrite the spec to align with the decision record before any implementation work.
7. **Decision records updated in-place**: When a decision changes, update the ADR/PDR directly. No "superseded" workflow.
8. **Coordination notes**: PLAN.md and ISSUES.md in node directories are committed coordination notes created during development or when closing a session via the `/handoff` skill. They are committed to git only to carry coordination across sessions and worktrees; they never hold spec assertions or decisions. They are not durable product truth and go stale unless acted upon, so verify a note before it steers work — reconcile it against the specs, decisions, assertions, tests, implementation, and current user intent. `/contextualizing` reads them automatically. Remove a resolved note; for ISSUES.md entries, either delete the fixed entry or convert unresolved product work into a spec node. These files are an escape hatch to make coordination visible and are committed independently from implementation work because other actors need to incorporate them into their decisions immediately.

---

## Numeric Prefixes

Numeric prefixes drive deterministic context injection within each directory:

1. Lower-index sibling specs are read as constraining context for higher-index targets.
2. Same-index siblings are listed but not read as target constraints.
3. Higher-index siblings are listed but not read as target constraints.
4. Files and directories share one number space. The numeric prefix sorts; the type suffix identifies the artifact.
5. Numbers are sibling-unique only. The same integer can be reused under a different parent.

Read an existing directory like this:

```text
spx/
  55-example.outcome/
    15-auth-strategy.adr.md
    21-test-harness.enabler/
    32-auth.outcome/
    32-billing.outcome/
    43-integration.outcome/
```

Work on `spx/55-example.outcome/43-integration.outcome/` reads `spx/55-example.outcome/15-auth-strategy.adr.md`, `spx/55-example.outcome/21-test-harness.enabler/test-harness.md`, `spx/55-example.outcome/32-auth.outcome/auth.md`, and `spx/55-example.outcome/32-billing.outcome/billing.md` as prior context. Work on `spx/55-example.outcome/32-auth.outcome/` does not read `spx/55-example.outcome/32-billing.outcome/`; same-index siblings are unordered peers.

Use `/decomposing` to create or restructure child nodes. It owns concern boundaries, node types, ordering evidence, and sparse index assignment.

**ALWAYS use full paths when referencing nodes, ADRs, and PDRs** — indices are sibling-unique, not globally unique, and bare decision filenames cannot be resolved:

| Wrong                  | Correct                                                       |
| ---------------------- | ------------------------------------------------------------- |
| "32-parser.enabler"    | "spx/55-example.enabler/12-infra.enabler/32-parser.enabler"   |
| "implement enabler-43" | "spx/55-example.enabler/12-infra.enabler/43-api.enabler"      |
| "15-build.adr.md"      | "spx/55-example.enabler/15-build.adr.md"                      |
| "21-pricing.pdr.md"    | "spx/55-example.enabler/21-billing.outcome/21-pricing.pdr.md" |

---

## When to Invoke Skills

### Before ANY spec-tree work → `/understanding`

**BLOCKING REQUIREMENT**

Loads the Spec Tree methodology. Required once per session and again after every individual compaction event.

### Before working on a specific node → `/contextualizing`

**BLOCKING REQUIREMENT**

**ALWAYS** invoke `/contextualizing` before working on a spec node.

**🛑 STOP TRIGGER — after every compaction event:** all loaded spec-tree context is gone. **Re-invoke `/contextualizing` on every node still in scope** before touching it again — not just the next one being worked on.

**NEVER** resume work on a node without having invoked `/contextualizing` since the last compaction.

### When creating specs or nodes → `/authoring`

Create product specs, ADRs/PDRs, enabler nodes, outcome nodes.

### When composing or breaking down nodes → `/decomposing`

Compose top-level children with `/decomposing spx/`. Decompose an existing node when it has too many assertions (>7), contains independent concerns, or has `PLAN.md`/`ISSUES.md` structure intent.

### When restructuring the tree → `/refactoring`

Move nodes, re-scope assertions, extract shared enablers, consolidate duplicates.

### When checking consistency → `/aligning`

Review, audit, or quality check specs. Find contradictions or gaps.

### When shipping work to the default branch → `/merge` (transport dispatcher)

**BLOCKING REQUIREMENT**

Every change destined for the default branch routes through `/merge`, the transport dispatcher. It reads `spx/local/merging.md`, classifies the changeset, selects the merge transport, and delegates to the selected transport's skills. The delivered-value boundary, the three authority gates, and the finding-disposition rule are transport-neutral and live in `/standardizing-merging`; `/merge` owns transport selection only.

Delivered value exists only when the changeset reaches the default branch on origin through `/merge`. A branch with committed changes ahead of its resolved base is unfinished even when the working tree is clean and deterministic verification, tests, local review, or audits have passed. A status assessment may report local evidence, then carry the changeset into the selected merge lifecycle; local readiness is not a reason to ask what to do next. Do not ask for confirmation before entering `/merge` unless `spx/local/merging.md` explicitly opts into pre-mutation confirmation or an explicit lifecycle gate requires operator input.

The selected transport binds publication mechanics and gate predicates without changing the gate set. `REVIEW_READINESS` holds when deterministic verification passes (the project's full validation-and-testing command) **and** the local review has converged. The local review invokes the `changes-reviewer` agent on the working diff — falling back to the `/review-changes` slash command when `changes-reviewer` is unavailable; both run the same `reviewing-changes` skill chain in an isolated context, so the verdict is not biased by the operator's main context. Findings are handled by **validity and phase, never severity**: validate each finding against its cited rule and drop any the citation does not support, apply every valid finding that belongs, and split out of the changeset only a fix too large to belong (recording it in the relevant node's `ISSUES.md` or `PLAN.md`). `MERGE_READINESS` and `PRODUCTION_READINESS` then govern the merge. See `/standardizing-merging` `<authority_gates>` for the three-gate vocabulary.

## Stop Triggers

Default-branch work is complete only when it reaches the default branch on origin through `/merge` — passing validation, tests, review, or audits is progress, not a stopping point, and an accepted proposal ("yes", "go", "do it") authorizes the whole lifecycle, not a pause. Each trigger below resolves the same way: finish the remaining independent work, then continue through `/committing-changes` and `/merge` until the change reaches the default branch on origin or an explicit lifecycle gate stops.

🛑 **About to summarize after edits, validation, tests, review, or audits passed** — do not conclude. Ensure the work is committed on a local branch, then drive `/merge`.

🛑 **About to report blocked, wait, or ask a question** — first do every action that does not need the answer: edits, verification, branch setup, commit, review. A blocker exists only when all three hold:

- the immediate next action cannot proceed without the operator or an external-state change;
- the local branch already holds every change makeable without the answer;
- the applicable gates have run or produced concrete failing evidence.

🛑 **About to finish on a detached HEAD or stop at a fresh commit** — `git status --short --branch` reporting `## HEAD (no branch)`, or a new local commit, is not an endpoint. Create or switch to a local branch preserving the worktree changes, then continue through `/merge` unless the user explicitly limited the task to local-only work.

---

## Quick Reference: Skills and Agents

Skills run in the main conversation. Agents preload the skill and run autonomously as subagents in a separate context, returning structured APPROVED/REJECTED verdicts. **ALWAYS run an audit through its agent** — the separate context keeps the verdict free of the main conversation's bias — and dispatch agents in parallel when auditing multiple targets.

| User Says...                               | Skill              | Agent                   |
| ------------------------------------------ | ------------------ | ----------------------- |
| "Implement this outcome"                   | `/contextualizing` | —                       |
| "Create an outcome"                        | `/authoring`       | —                       |
| "Add an ADR"                               | `/authoring`       | —                       |
| "Add a new node" or "This node is too big" | `/decomposing`     | —                       |
| "Move this under that"                     | `/refactoring`     | —                       |
| "Check these specs"                        | `/aligning`        | —                       |
| "Write tests for this"                     | `/testing`         | —                       |
| "Start the TDD flow"                       | `/applying`        | `applier`               |
| "Audit this PDR"                           | `/audit-pdr`       | `pdr-auditor`           |
| "Audit this ADR"                           | `/audit-adr`       | `adr-auditor`           |
| "Audit test evidence"                      | `/auditing-tests`  | `test-evidence-auditor` |

Per-language code, architecture, and test audits render for the product's enabled languages:

| User Says...                | Skill                               | Agent                             |
| --------------------------- | ----------------------------------- | --------------------------------- |
| "Audit this code"           | `/auditing-typescript`              | `typescript-code-auditor`         |
| "Audit ADRs for TypeScript" | `/auditing-typescript-architecture` | `typescript-architecture-auditor` |
| "Audit these tests"         | `/auditing-typescript-tests`        | `typescript-test-auditor`         |

---

## Test Naming Convention

Test level is encoded in the filename. This guide renders only the languages listed in its `languages` frontmatter; `/update-spx` re-renders from the installed template when the methodology advances.

### TypeScript

| Level | Pattern                           | Example                        |
| ----- | --------------------------------- | ------------------------------ |
| 1     | `{subject}.{evidence}.l1.test.ts` | `parsing.scenario.l1.test.ts`  |
| 2     | `{subject}.{evidence}.l2.test.ts` | `cli.scenario.l2.test.ts`      |
| 3     | `{subject}.{evidence}.l3.test.ts` | `workflow.scenario.l3.test.ts` |

---

## Assertion Evidence Contract

Spec assertions link to their evidence inline:

```markdown
### Scenarios

- Given X, when Y, then Z ([test](tests/test_slug.scenario.l1.py))
```

Use `[test](...)` for automated evidence verified by a test runner, `[eval](...)` for LLM-driven behavior verified by graded cases against a structured verdict, and `[audit]` for semantic constraints judged by an auditing skill that no deterministic test or eval can falsify (`[review]` is the legacy form of `[audit]`, still accepted during migration). Every assertion carries exactly one verification-type tag. The `[eval]` link points at a per-eval directory's `eval.toml`; the eval runner is declared per project.

---

## Excluded Nodes

Nodes with specs and tests but no implementation are listed in `spx/EXCLUDE`. The `spx` CLI reads this file and skips excluded nodes when running `spx test passing`. Linting always applies — style is checked regardless of implementation existence.

`spx` never writes to product configuration files. It passes exclusion flags to each tool at invocation time.

Remove entries when implementation begins and tests should start running.

---

## Session Management

Claude Code session handoffs are stored in `.spx/sessions/` (separate from the spec tree):

```text
.spx/sessions/
├── todo/          # Available for /pickup
├── doing/         # Currently claimed
└── archive/       # Completed sessions
```

Use `/handoff` to create, `/pickup` to claim, `spx session release` to return a claimed session to the queue.

Session files use structured YAML frontmatter (rendered by the CLI from JSON input):

```yaml
---
priority: medium
git_ref: work/example
goal: Implement X
next_step: Run the focused validation
specs:
  - spx/55-example.enabler/21-session.enabler/session.md
files:
  - src/commands/session/handoff.ts
created_at: 2026-05-30T14:22:00.000Z
agent_session_id: abc123-def456
---
```

`spx session handoff` reads a JSON header on the first line of stdin followed by the body bytes. It prefills `created_at` and `agent_session_id` when available, and records the header's `git_ref` — the work branch `/handoff` supplies — after confirming that branch exists on `origin`; when `git_ref` is omitted it derives the base from the git context. The handoff must provide non-empty `goal` and `next_step`.
