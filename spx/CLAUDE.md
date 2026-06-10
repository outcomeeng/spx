---
template_version: "0.18.5"
template_source: spec-tree
languages: [typescript]
---

# spx/ Directory Guide (Spec Tree)

This guide explains WHEN to invoke spec-tree skills for this product. It is a **router** — the skills contain the HOW.

---

## Structure Overview

The `spx/` tree is a durable map of the product. Nothing moves because work is "done" — specs are permanent product truth, not a backlog.

Two node types at any depth:

```text
spx/
  {product-slug}.product.md            # Product spec (root)
  NN-{slug}.adr.md                     # Architecture decision
  NN-{slug}.pdr.md                     # Product decision
  NN-{slug}.enabler/                   # Shared infrastructure
    {slug}.md                          # Spec file
    tests/                             # Co-located tests
    PLAN.md                            # Coordination note: deferred plan (optional)
    ISSUES.md                          # Coordination note: known issues (optional)
    NN-{slug}.enabler/                 # Children: enablers only
  NN-{slug}.outcome/                   # Hypothesis + assertions
    {slug}.md                          # Spec file
    tests/                             # Co-located tests
    PLAN.md                            # Coordination note: deferred plan (optional)
    ISSUES.md                          # Coordination note: known issues (optional)
    NN-{slug}.{enabler|outcome}/       # Children: enablers and outcomes
```

---

## Key Principles

1. **Durable map**: Specs stay in place. Nothing moves because work is "done."
2. **Two node types**: Enabler (infrastructure, output is known) and outcome (hypothesis, output is a bet). Enablers can only contain enabler children. Outcomes can contain both.
3. **Co-location**: Tests live with their spec in `tests/`.
4. **Atemporal voice**: Specs state product truth. Never narrate history.
5. **Deterministic context**: The tree path defines what context gets loaded for work on a target.
6. **Decision records win by hierarchy**: If a spec contradicts an ADR or PDR in its ancestry, the spec is wrong. Rewrite the spec to align with the decision record before any implementation work.
7. **Decision records updated in-place**: When a decision changes, update the ADR/PDR directly. No "superseded" workflow.
8. **Coordination notes**: PLAN.md and ISSUES.md in node directories are committed coordination notes created during development or left by `/handoff`. They are committed to git only to carry coordination across sessions; they never hold spec assertions or decisions. They go stale unless acted upon, so verify a note before it steers work — reconcile it against the specs, decisions, assertions, tests, implementation, and current user intent. `/contextualizing` reads them automatically. Remove a resolved note; for ISSUES.md entries, either delete the fixed entry or convert unresolved product work into a spec node. These files exist to make coordination visible and may be committed independently from implementation work when collaborators need the state immediately.

---

## Process Hygiene

The runtime spawns helper processes — a periodic `pgrep` to monitor backgrounded commands, plus a shell and its children for every command call — and does not reliably reap them. A construct that creates many short-lived children (a poll loop), a long-lived child the monitor keeps polling (`gh run watch`, a backgrounded `sleep`, an idle keep-alive command), or several heavy process trees at once will exhaust the per-user process limit: `posix_spawn` then returns `EAGAIN`, the monitor's `pgrep` crash-loops, and Claude is force-killed. The leak is outside repository control; these rules keep it from being triggered. Apply them with the tool names of the runtime you are in.

- **Never wait or pace work with a shell construct.** No `while`/`until` poll loop. No `gh run watch`. No `sleep` to wait — foreground or backgrounded, alone or in a loop. To wait for a build, test run, process, or review to resolve, or to re-check on an interval, use the runtime's timer: in Claude Code, `/loop` for recurring work or `ScheduleWakeup` for a single delayed re-check; in Codex, a `codex_app.automation_update` thread heartbeat. The timer re-invokes you — the wait happens between turns, not inside a shell.
- **Background commands: one at a time, short-lived, never a keep-alive.** Every backgrounded command is a process the monitor `pgrep`s on a timer; a pile of them — or one that never exits — is the `pgrep` storm itself.
- **Heavy subprocess trees run sparingly, serially, load-aware.** A full test run, a build, and similar each fork dozens of children. Before launching one, read `uptime` and compare the sustained loadavg (the 5- and 15-minute figures) to the host's core count (`nproc`, or `sysctl -n hw.ncpu` on macOS); if loadavg exceeds it, defer rather than pile on. Never run two heavy commands concurrently. Run the test suite once before committing, not repeatedly "to be sure".
- **Other forks add up.** Don't spawn subagents you don't need — each is its own process tree. Redirect a long-running command's output to a file and read it in a separate call, rather than piping through `grep`/`tail`/`head`.
- **If a previous turn left something running** — a `sleep`, a poll loop, a `gh run watch`, an orphaned test runner — identify it and terminate it by PID before doing anything else.

---

## Numeric Prefixes

Numeric prefixes drive deterministic context loading within each directory:

1. Lower-index sibling specs are read as constraining context for higher-index targets.
2. Same-index siblings are listed but not read as target constraints.
3. Higher-index siblings are listed but not read as target constraints.
4. Files and directories share one number space. The numeric prefix sorts; the type suffix identifies the artifact.
5. Numbers are sibling-unique only. The same integer can be reused under a different parent.

Read an existing directory like this:

```text
spx/
  15-auth-strategy.adr.md
  21-test-harness.enabler/
  32-auth.outcome/
  32-billing.outcome/
  43-integration.outcome/
```

Work on `spx/43-integration.outcome/` reads `spx/15-auth-strategy.adr.md`, `spx/21-test-harness.enabler/test-harness.md`, `spx/32-auth.outcome/auth.md`, and `spx/32-billing.outcome/billing.md` as prior context. Work on `spx/32-auth.outcome/` does not read `spx/32-billing.outcome/`; same-index siblings are unordered peers.

Use `/decomposing` to create or restructure child nodes. It owns concern boundaries, node types, ordering evidence, and sparse index assignment.

**ALWAYS use full paths when referencing nodes, ADRs, and PDRs** — indices are sibling-unique, not globally unique, and bare decision filenames cannot be resolved:

| Wrong                  | Correct                                    |
| ---------------------- | ------------------------------------------ |
| "32-parser.enabler"    | "spx/21-infra.enabler/32-parser.enabler"   |
| "implement enabler-43" | "spx/21-infra.enabler/43-api.enabler"      |
| "15-build.adr.md"      | "spx/21-spec-tree.enabler/15-build.adr.md" |
| "21-pricing.pdr.md"    | "spx/32-billing.outcome/21-pricing.pdr.md" |

---

## When to Invoke Skills

### Before ANY spec-tree work → `/understanding`

**BLOCKING REQUIREMENT**

Loads the Spec Tree methodology. Emits `<SPEC_TREE_FOUNDATION>` marker. Required once per session.

### Before working on a specific node → `/contextualizing`

**BLOCKING REQUIREMENT**

Walks the tree from product root to target, reads all ancestor specs, lower-index siblings, and ADRs/PDRs.

### When creating specs or nodes → `/authoring`

Create product specs, ADRs/PDRs, enabler nodes, outcome nodes.

### When composing or breaking down nodes → `/decomposing`

Compose top-level children with `/decomposing spx/`. Decompose an existing node when it has too many assertions (>7), contains independent concerns, or has `PLAN.md`/`ISSUES.md` structure intent.

### When restructuring the tree → `/refactoring`

Move nodes, re-scope assertions, extract shared enablers, consolidate duplicates.

### When checking consistency → `/aligning`

Review, audit, or quality check specs. Find contradictions or gaps.

### When shipping PR work → `/pr` (lifecycle router)

**BLOCKING REQUIREMENT**

Every change destined for the default branch routes through `/pr` unless `spx/local/merging.md` declares a no-PR route or a product-specific lifecycle. `/pr` proposes the lifecycle before mutation, then invokes the internal PR protocols. The opening protocol passes through the `REVIEW_READINESS` gate before the PR opens. The gate holds when deterministic verification passes (the project's full validation-and-testing command) **and** the local review has converged. The opening protocol invokes the `changes-reviewer` agent on the working diff — falling back to the `/review-changes` slash command when the agent is not installed; both run the same `reviewing-changes` skill chain in an isolated context, so the verdict is not biased by what the operator's main agent has been doing. The agent acts on each finding by **validity and phase, never severity**: it validates each finding against its cited rule and drops any the citation does not support, applies every valid finding that belongs, and splits out of the changeset any whose fix is too large to belong (recording it in the relevant node's `ISSUES.md` or `PLAN.md`). Once `REVIEW_READINESS` holds the PR opens `ready_for_review`; `MERGE_READINESS` and `PRODUCTION_READINESS` then govern the merge. See `/standardizing-merging` `<authority_gates>` for the three-gate vocabulary.

---

## Quick Reference: Skills and Agents

Skills run in the main conversation. Agents preload the skill and run autonomously as subagents, returning structured APPROVED/REJECTED verdicts. Use agents when running multiple audits in parallel; use skills when you want to discuss findings with the user.

| User Says...             | Skill              | Agent                   |
| ------------------------ | ------------------ | ----------------------- |
| "Implement this outcome" | `/contextualizing` | —                       |
| "Create an outcome"      | `/authoring`       | —                       |
| "Add an ADR"             | `/authoring`       | —                       |
| "This node is too big"   | `/decomposing`     | —                       |
| "Move this under that"   | `/refactoring`     | —                       |
| "Check these specs"      | `/aligning`        | —                       |
| "Write tests for this"   | `/testing`         | —                       |
| "Start the TDD flow"     | `/applying`        | `applier`               |
| "Audit this PDR"         | `/audit-pdr`       | `audit-pdr`             |
| "Audit this ADR"         | `/audit-adr`       | `audit-adr`             |
| "Audit test evidence"    | `/auditing-tests`  | `test-evidence-auditor` |

Per-language code, architecture, and test audits render for the product's enabled languages:

| User Says...                | Skill                               | Agent                             |
| --------------------------- | ----------------------------------- | --------------------------------- |
| "Audit this code"           | `/typescript:auditing-typescript`              | `typescript-code-auditor`         |
| "Audit ADRs for TypeScript" | `/typescript:auditing-typescript-architecture` | `typescript-architecture-auditor` |
| "Audit these tests"         | `/typescript:auditing-typescript-tests`        | `typescript-test-auditor`         |

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

## Passing-Scope Filters

Nodes with specs and tests but no implementation are excluded from `spx test passing` through the testing descriptor in `spx.config.{toml,json,yaml}`. Normal `spx test` discovery remains independent from passing-scope filters. Linting always applies — style is checked regardless of implementation existence.

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
  - spx/36-session.enabler/session.md
files:
  - src/commands/session/handoff.ts
created_at: 2026-05-30T14:22:00.000Z
agent_session_id: abc123-def456
---
```

`spx session handoff` reads a JSON header on the first line of stdin followed by the body bytes. It prefills `created_at`, `agent_session_id` when available, and `git_ref`. The handoff must provide non-empty `goal` and `next_step`. Before archiving a claimed session, add a non-empty `result` to that session's frontmatter.
