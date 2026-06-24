---
template_version: "0.21.2"
template_source: spec-tree
languages: [typescript]
---

# spx/ Directory Guide (Spec Tree)

This guide explains WHEN to invoke spec-tree skills for this product. It is a **router** — the skills contain the HOW.

---

## When to Invoke Skills

### Before ANY spec-tree work -> `/understand`

**BLOCKING REQUIREMENT**

Loads the Spec Tree methodology. Required once per session and again after every individual compaction event.

### Before working on a specific node -> `/contextualize`

**BLOCKING REQUIREMENT**

**ALWAYS** invoke `/contextualize` before working on a spec node.

**🛑 STOP TRIGGER — after every compaction event:** all loaded spec-tree context is gone. **Re-invoke `/contextualize` on every node still in scope** before touching it again — not just the next one being worked on.

**NEVER** resume work on a node without having invoked `/contextualize` since the last compaction.

### When creating specs or nodes -> `/author`

Create product specs, ADRs/PDRs, enabler nodes, outcome nodes.

### When composing or breaking down nodes -> `/decompose`

Compose top-level children with `/decompose spx/`. Decompose an existing node when it has too many assertions (>7), contains independent concerns, or has `PLAN.md`/`ISSUES.md` structure intent.

### When restructuring the tree -> `/refactor`

Move nodes, re-scope assertions, extract shared enablers, consolidate duplicates.

### When checking consistency -> `/align`

Review, audit, or quality check specs. Find contradictions or gaps.

### When shipping work to the default branch -> `/merge` (transport dispatcher)

**BLOCKING REQUIREMENT**

Every change destined for the default branch routes through `/merge`, the transport dispatcher — it reads `spx/local/merging.md`, classifies the changeset, selects the transport, and delegates. The three authority gates, the delivered-value boundary, and the finding-disposition rule are transport-neutral and live in `/merging-standards`.

## Stop Triggers

Default-branch work is complete only when it reaches the default branch on origin through `/merge` — passing validation, tests, review, or audits is progress, not a stopping point, and an accepted proposal ("yes", "go", "do it") authorizes the whole lifecycle, not a pause. Each trigger below resolves the same way: finish the remaining independent work, then continue through `/commit-changes` and `/merge` until the change reaches the default branch on origin or an explicit lifecycle gate stops.

🛑 **About to summarize after edits, validation, tests, review, or audits passed** — do not conclude. Ensure the work is committed on a local branch, then drive `/merge`.

🛑 **About to report blocked, wait, or ask a question** — first do every action that does not need the answer: edits, verification, branch setup, commit, review. A blocker exists only when all three hold:

- the immediate next action cannot proceed without the operator or an external-state change;
- the local branch already holds every change makeable without the answer;
- the applicable gates have run or produced concrete failing evidence.

🛑 **About to finish on a detached HEAD or stop at a fresh commit** — `git status --short --branch` reporting `## HEAD (no branch)`, or a new local commit, is not an endpoint. Create or switch to a local branch preserving the worktree changes, then continue through `/merge` unless the user explicitly limited the task to local-only work.

---

## Quick Reference: Skills and Agents

Skills run in the main conversation. Agents preload the skill and run autonomously as subagents in a separate context, returning structured APPROVED/REJECTED verdicts. **ALWAYS run an audit through its agent** — the separate context keeps the verdict free of the main conversation's bias — and dispatch agents in parallel when auditing multiple targets.

**Prefer auditor and reviewer work in a subagent when the runtime provides the matching agent.** When an audit or review is called for and subagents are available, spawn the matching subagent — `changes-reviewer` for a changeset review, `skill-auditor`, `adr-auditor`, `pdr-auditor`, or `test-evidence-auditor` for the artifact in scope — and act only on the verdict it returns. This generated guide is explicit workflow authorization to spawn the required read-only verifier subagents; do not ask the operator for additional permission to run them. Runtime approval prompts are separate: if the tool itself asks for approval, answer that prompt through the runtime approval flow. If the matching subagent is unavailable in the current runtime, run the corresponding review or audit skill in the main conversation as the fallback path and treat its verdict as the gate result.

| User Says...                               | Skill            | Agent                   |
| ------------------------------------------ | ---------------- | ----------------------- |
| "Implement this outcome"                   | `/contextualize` | —                       |
| "Create an outcome"                        | `/author`        | —                       |
| "Add an ADR"                               | `/author`        | —                       |
| "Add a new node" or "This node is too big" | `/decompose`     | —                       |
| "Move this under that"                     | `/refactor`      | —                       |
| "Check these specs"                        | `/align`         | —                       |
| "Write tests for this"                     | `/test`          | —                       |
| "Start the TDD flow"                       | `/apply`         | `applier`               |
| "Audit this PDR"                           | `/audit-pdr`     | `pdr-auditor`           |
| "Audit this ADR"                           | `/audit-adr`     | `adr-auditor`           |
| "Audit test evidence"                      | `/audit-tests`   | `test-evidence-auditor` |
| "Audit this spec node"                     | `/audit-specs`   | `spec-auditor`          |
| "Diagnose the spx environment"             | `/diagnose`      | —                       |

Per-language code, architecture, and test audits ship as `audit-{lang}*` skills that the generic artifact-type auditors **compose** for the language in scope — there is no per-language auditor agent. Dispatch the generic auditor; it invokes the matching language skill automatically:

| User Says...                | Skill (composed)                 | Composing agent             |
| --------------------------- | -------------------------------- | --------------------------- |
| "Audit this code"           | `/audit-typescript`              | `auditor` (`/audit` family) |
| "Audit ADRs for TypeScript" | `/audit-typescript-architecture` | `adr-auditor`               |
| "Audit these tests"         | `/audit-typescript-tests`        | `test-evidence-auditor`     |

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

## Session Management

Sessions are shared across every worktree. Each session must be handed off via `/handoff` so it can be resumed from any other worktree: the handoff leaves the worktree clean and persists all state on origin. Propose a handoff when the session's goal is met or the work must pause; resume one with `/pickup`.
