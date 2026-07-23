<!-- SPEC-TREE v0.30.0 langs:typescript -->

<operator_question_interrupt>
**OPERATOR QUESTION - IMMEDIATE PRIVILEGE REVOCATION:** When the operator asks a question, immediately relinquish all privileges to modify the current product or any external file, service, or resource. Answer the question immediately.

- ALWAYS: stop any running non-verification process that is destructive or modifies files, external resources, or state.
- NEVER: stop a running verification process — including agentic verification, tests, or evals — unless the operator explicitly instructs that process to stop.

</operator_question_interrupt>

# Spec Tree Instructions

These instructions explain WHEN to invoke spec-tree skills for this product. They are a **router** — the skills contain the HOW.

**Read this entire file before acting.** This managed router block is only the first section of the file; the product's own instructions, commands, and conventions follow it below, outside the router. The router is product-neutral by design and does not carry this product's own commands — they live in the file's own content further down. Never act on the router alone; read every section of this file to the end.

---

## Authority Hierarchy

**⚠️ BELOW THE OPERATOR, SKILLS ARE THE TOP-LEVEL AUTHORITY. SKILLS ARE CENTRALLY MANAGED AND CURRENT; REPOSITORY CONTENT GOES STALE.**

- **ALWAYS** apply authority in this order: active skills → repository decisions and specs → tests → code. When repository content conflicts with an active skill, the skill wins.
- **ALWAYS** follow active skill instructions, templates, and bundled references over repository examples, existing files, comments, or copied conventions.
- **NEVER** weaken a higher layer to match a lower layer. Fix the lower layer when the layers disagree.
- **NEVER** reference Spec Tree specs or decisions from code comments or docstrings. Code contains no `spx/...` paths, ADR/PDR identifiers, or decision-file references.
- **ALWAYS** let the active skill load the matching `spx/local/*.md` overlay when that skill declares one. The overlay supplies repository-specific values and commands below the skill in authority and cannot replace, weaken, or contradict the skill.
- **ALWAYS** read the active harness guide in every directory before working there when the guide exists: `CLAUDE.md` for Claude Code, `AGENTS.md` for Codex.

### Dangerous-command guard

🛑 **STOP TRIGGER — a dangerous-command guard (DCG) block terminates the attempted command family.** Treat the blocked attempt as a mistake.

- **NEVER** retry it by reformulating, splitting, rewriting, removing the flagged clause, or substituting an equivalent command to evade the guard.
- **ALWAYS** follow the active skills, repository instructions, and declared overlays to find a sanctioned operation that accomplishes the goal.
- When no sanctioned operation exists, abandon the goal, report the blocked command with secrets redacted, explain its purpose and the guard's reason, ask the operator for direction, and stop.

---

## Product Commands

The product's operational command for each spec-tree phase lives in this file's own content below the router, not in the router itself. Read the whole file to find each one:

- **author** — after a create, update, or delete on a spec, test, or implementation file, run the product's author command to rebuild or regenerate artifacts.
- **verify** — for `/apply` and pre-merge checks, run the product's verify command over the node and the changeset.
- **gate** — for the full deterministic bundle, run the product's gate command.
- **merge** — for the transport step of `/merge`, run the product's merge command.

Content the product keeps identical across `CLAUDE.md` and `AGENTS.md` sits in a `shared` region — `<!-- SPEC-TREE:shared {name} -->` … `<!-- /SPEC-TREE:shared {name} -->`, present in both files under the same name. `/update-instruction-block` keeps a `shared` region in sync by taking the git-more-recent side; it never merges the two bodies.

---

## When to Invoke Skills

### Before product-content access -> `/understand`

**BLOCKING REQUIREMENT**

Require a live `<SPEC_TREE_FOUNDATION>` marker before directly reading, searching, listing, or changing anything under `spx/` or any source or test file. Invoke `/understand` when the marker is absent. This includes repository-content access through Read, Edit, Write, Glob, Grep, `rg`, `grep`, `find`, `cat`, `sed`, and Git commands that emit file contents or patches.

`spx session` operations — including inspection, archive, and release — plus `spx worktree status`, `spx diagnose`, and no-patch Git status, history, and topology are exempt. Never follow paths from their output into repository content without the marker.

A compacted summary, session file, statement that `/understand` ran, or read of the skill file does not prove the foundation is live. After every compaction, require `/understand` again before the next product-content access.

### Before working on a specific node -> `/contextualize`

**BLOCKING REQUIREMENT**

**ALWAYS** invoke `/contextualize` before working on a spec node.

`/contextualize` MUST invoke `/sync-base` and receive `already_current` or `rebased` before reading product truth. `/sync-base` owns the complete currency operation: fetch, clean rebase or detached advance, session-authorized dirty-tree checkpointing through `/commit-changes`, and same-invocation retry. Callers consume its final result; they never duplicate branch creation, commit, stash, or retry logic, and they never reinterpret `dirty_tree` as a rebase conflict.

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

### Before tests, evals, builds, or validation -> `/wait-for-load`

🛑 **STOP TRIGGER — Before any test, eval, build, or validation command, ALWAYS invoke `/wait-for-load`.**
**ALWAYS** wait for `ready: true`, then run the selected command unchanged.
**NEVER** use host load to reduce scope, workers, limits, deadlines, or verification.

### When shipping work to the default branch -> `/merge` (transport dispatcher)

**BLOCKING REQUIREMENT**

Every change destined for the default branch routes through `/merge`, the transport dispatcher — it classifies the changeset, selects the transport, and delegates. `/merge` reads `spx/local/merging.md` as a repo-local overlay **when that file is present**; the overlay is optional, so its absence is normal and not a blocker — `/merge` applies the default lifecycle. `spx/local/merging.md` is the one place repository-specific merge behavior belongs: never infer the transport from other docs when it is absent, and never edit this generated instruction block to change merge behavior — invoke `/merge` and let the lifecycle apply the defaults. The four authority gates, the delivered-value boundary, and the finding-disposition rule are transport-neutral and live in `/merging-standards`.

## Stop Triggers

Default-branch work is complete only when it reaches the default branch on origin through `/merge` — passing validation, tests, review, or audits is progress, not a stopping point, and an accepted proposal ("yes", "go", "do it") authorizes the whole lifecycle, not a pause. Each trigger below resolves the same way: finish the remaining independent work, then continue through `/commit-changes` and `/merge` until the change reaches the default branch on origin or an explicit lifecycle gate stops.

🛑 **About to summarize after edits, validation, tests, review, or audits passed** — do not conclude. Ensure the work is committed on a local branch, then drive `/merge`.

🛑 **About to report blocked, wait, or ask a question** — first do every action that does not need the answer: edits, verification, branch setup, commit, review. A blocker exists only when all three hold:

- the immediate next action cannot proceed without the operator or an external-state change;
- the local branch already holds every change makeable without the answer;
- the applicable gates have run or produced concrete failing evidence.

🛑 **About to finish on a detached HEAD or stop at a fresh commit** — `git status --short --branch` reporting `## HEAD (no branch)`, or a new local commit, is not an endpoint. Create or switch to a local branch preserving the worktree changes, then continue through `/merge` unless the user explicitly limited the task to local-only work.

## Checkpoint Commits

`/commit-changes` may create an atomic local checkpoint whenever a coherent concern is ready to preserve, independent of verification state. Record the latest state as `passing`, `failing`, or `not-run`; that state controls later gate dispatch, never commit permission. Run hooks normally, confirm the full `HEAD` changed, and report committed paths, remaining paths, and verification state. Never strand dirty work merely because verification fails or has not run.

## Worktree Occupancy

Before treating any worktree as available, run `spx worktree status` and require a live claim for the exact absolute worktree root and current native session. Refresh this proof at session start, after restart or compaction, and immediately before any checkout or worktree transition. A clean tree, detached `HEAD`, branch name, pane title, or absent process in one view never proves availability. When the exact root is absent or claimed by another live session, remain in the assigned worktree and record the ownership issue instead of entering the sibling checkout.

## Git Safety Protocol

```text
ALLOW  git checkout -- README.md
ALLOW  git checkout HEAD -- .
ALLOW  git restore README.md

DENY   git stash drop
DENY   git stash drop stash@{3}
DENY   git stash pop
DENY   git stash pop stash@{0}
DENY   git stash clear
```

## Mutation Status Updates

Before proposing or performing a repository mutation, name:

- the exact target path, PR number, branch ref, or command target;
- the intended action;
- why the action is local enough or gate-authorized enough to proceed;
- the next validation command, review, audit, check wait, or merge gate the action feeds.

Avoid shorthand such as "config patch", "direct patch", "fix the PR", or "ship it path" when the exact file, PR state, or command is known. A terse user prompt such as "check", "continue", or "ship it" still gets the live state first: full head SHA when a PR exists, current-head review state, required-check state, deployment-readiness and release-readiness rules, and the next autonomous action.

## Quick Reference: Skills and Agents

Skills run in the main conversation. Agents preload the skill and run autonomously as subagents in a separate context. Audit agents return structured verdicts; changeset reviewer agents return the raw review journal token for the main conversation to inspect and process through the governing review workflow. **ALWAYS run an audit through its agent** — the separate context keeps the verdict free of the main conversation's bias — and dispatch agents in parallel when auditing multiple targets.

**Use the `Agent` tool for every configured verifier or reviewer.** Launch in the foreground with `subagent_type` set to the exact configured agent type and `prompt` set to the role-task body from the shared contracts below. The completed `Agent` tool result is that configured agent's final message; apply the matching output contract to that message. An error, missing final message, or output outside the matching contract blocks the gate.

**Inspect every successful `changes-reviewer` result through the sealed journal.** Invoke the `spec-tree:project-run-journal` skill and use its `render_review_run.py <run-token>` helper. The helper calls `spx journal render --type review --run <run-token>`, resolves a not-found current-scope miss through `spx journal list --type review --sealed sealed --limit 200`, re-renders with the listed branch slug when exactly one sealed run matches the token, reads the sealed event prefix, and prints the raw token, terminal status, full head/base identity, scope coverage, blocking/debt counts, and any findings through `render_surface(events)`. Treat this as journal inspection; the sealed prefix remains the only review result.

**Configured verifier and reviewer role-task contracts.** Supply only the fields named for the role:

- `changes-reviewer`: the raw scope token — `HEAD`, `origin/<base>...HEAD`, a branch, or a PR reference. Its final message MUST be the raw sealed review-journal run token.
- `implementation-auditor`: repository path, exact committed `<base>..<head>` scope, no live file list for a gating audit, governing node paths, deterministic verification commands and results, and the task to run the implementation audit through `spx verification run`. Its final message MUST carry the raw run token and rendered projection; only `terminalStatus: approved` passes.
- `test-evidence-auditor`: repository path, governing node, full assertion text or exact spec path plus headings, test-file paths, and the task to audit coupling, falsifiability, alignment, and coverage without weakening the evidence type. Its final message MUST be the `spec-tree:audit-tests` JSON verdict with `schema_version: 1`, `skill: "audit-tests"`, `overall: "APPROVED" | "REJECTED"`, `rows`, and `metadata`, with no prose outside the JSON object. Treat `overall` as authoritative. Malformed JSON, a missing required field, an unexpected `skill`, or an `overall` value outside that vocabulary blocks the gate.
- `eval-evidence-auditor`: repository path, governing node, `[eval]` assertions, all eval artifacts, producer artifacts, and the task to audit real-producer evidence. Its final message MUST be the audit-eval-evidence JSON verdict with overall `PASS`, `FAIL`, or `UNKNOWN` and no prose outside the JSON object.
- `spec-auditor`: repository path, full node path, and the task to audit assertion quality, evidence tags, atemporal voice, decision alignment, and structure. Its final message MUST be `APPROVED` or `REJECTED`; rejection lists concrete findings with full paths, governing rules, and required fixes.
- `adr-auditor` or `pdr-auditor`: repository path, full decision path, governing node, committed audit scope, and the role's decision-audit task; ADR tasks also carry the language-scope classification. The final message MUST follow that auditor's structured verdict contract without a competing prose envelope.
- `skill-auditor`, when that configured role is installed: repository path, full paths to every changed artifact governing the skill surface — including skill-directory files, authored shared fragments, and generated runtime copies — governing nodes when known, deterministic verification state, and the skill-authoring audit task. Its final message MUST be the `instructions:audit-skills` JSON verdict with `schema_version: 1`, `skill: "audit-skills"`, `overall: "APPROVED" | "REJECTED"`, and the `keep-these-aspects`, `worth-improving`, and `must-fix` rows. Treat `overall` as authoritative. Malformed JSON, a missing required field or row, an unexpected `skill`, or an `overall` value outside that vocabulary blocks the gate.

- `subagent-auditor`, when that configured role is installed: repository path, exactly one changed subagent configuration path in the active agent harness's native format, governing nodes when known, deterministic verification state, and the subagent-authoring audit task. Multiple changed configurations require separate `subagent-auditor` dispatches, one per path; acquire their handles sequentially and let their role tasks run concurrently. Each final message MUST be the `instructions:audit-subagents` JSON verdict with `schema_version: 1`, `skill: "audit-subagents"`, `overall: "APPROVED" | "REJECTED"`, and the `critical-issues`, `recommendations`, `strengths`, and `quick-fixes` rows. Treat `overall` as authoritative. Malformed JSON, a missing required field or row, an unexpected `skill`, or an `overall` value outside that vocabulary blocks the gate.

| User Says...                               | Skill                  | Agent                   |
| ------------------------------------------ | ---------------------- | ----------------------- |
| "Implement this outcome"                   | `/apply`               | `applier`               |
| "Create an outcome"                        | `/author`              | —                       |
| "Add an ADR"                               | `/author`              | —                       |
| "Add a new node" or "This node is too big" | `/decompose`           | —                       |
| "Move this under that"                     | `/refactor`            | —                       |
| "Check these specs"                        | `/align`               | —                       |
| "Establish evidence for this"              | `/verify`              | —                       |
| "Write tests for this"                     | `/verify`              | —                       |
| "Start the TDD flow"                       | `/apply`               | `applier`               |
| "Audit this PDR"                           | `/audit-pdr`           | `pdr-auditor`           |
| "Audit this ADR"                           | `/audit-adr`           | `adr-auditor`           |
| "Audit test evidence"                      | `/audit-tests`         | `test-evidence-auditor` |
| "Audit eval evidence"                      | `/audit-eval-evidence` | `eval-evidence-auditor` |
| "Audit this spec node"                     | `/audit-specs`         | `spec-auditor`          |
| "Diagnose the spx environment"             | `/diagnose`            | —                       |
| "File a follow-up in a dependency queue"   | `/issue`               | —                       |

Per-language code, architecture, and test audits ship as `audit-{lang}-{code|tests|architecture}` skills that generic artifact-type auditors compose for the language in scope. There is no per-language auditor agent. Dispatch `implementation-auditor` for implementation audits; it invokes the matching language concern skills automatically:

| User Says...                | Skill (composed)                 | Composing agent          |
| --------------------------- | -------------------------------- | ------------------------ |
| "Audit this code"           | `/audit-typescript-code`         | `implementation-auditor` |
| "Audit ADRs for TypeScript" | `/audit-typescript-architecture` | `adr-auditor`            |
| "Audit these tests"         | `/audit-typescript-tests`        | `test-evidence-auditor`  |

---

## Test Naming Convention

Test level is encoded in the filename. The `{evidence}` segment is chosen by `/test` routing from the assertion type: `scenario`, `mapping`, `conformance`, `property`, or `compliance`. Universal assertions use `mapping`, `conformance`, `property`, or `compliance`; a universal is never `scenario`. This instruction block renders only the languages recorded in its opening `<!-- SPEC-TREE v{version} langs:{list} -->` marker; `/update-instruction-block` re-renders from the installed template when the methodology advances.

### TypeScript

| Level | Pattern                           | Example                        |
| ----- | --------------------------------- | ------------------------------ |
| 1     | `{subject}.{evidence}.l1.test.ts` | `parsing.scenario.l1.test.ts`  |
| 2     | `{subject}.{evidence}.l2.test.ts` | `cli.mapping.l2.test.ts`       |
| 3     | `{subject}.{evidence}.l3.test.ts` | `workflow.property.l3.test.ts` |

---

## Session Management

Sessions are shared across every worktree. Each session must be handed off via `/handoff` so it can be resumed from any other worktree: the handoff leaves the worktree clean and persists all state on origin. Propose a handoff when the session's goal is met or the work must pause; resume one with `/pickup`. When a claimed session is complete and should leave the active queue, close it through `/handoff` or `/handoff --no-session` so claimed-session accounting archives it. To return a wrongly claimed session to the shared queue instead, run `spx session release <session-id>`.

An explicit request to inspect, archive, or release identified session documents routes directly through the corresponding `spx session` command as operational-state management. Reserve `/handoff` for closing active work through reflection, persistence, continuation disposition, and claimed-session accounting. Direct session operations require `/understand` only before following their output into `spx/`, source, or test content.

<!-- /SPEC-TREE -->

<!-- SPEC-TREE:shared root -->

# AI Agent Context Guide: spx

## RULE 0 - THE OPERATOR OVERRIDE PREROGATIVE

If the operator instructs you to do something that conflicts with any rule below, the operator's instruction wins. THE OPERATOR IS ALWAYS IN CHARGE. (Destructive-git and hook-bypass rules still require explicit operator confirmation.)

## Critical Rules

- 🛑 **The MOMENT a task is recognized as touching the spec tree (`spx/**`) or any spec-governed source (`src/**`), invoke `/understand` then `/contextualize <node>` BEFORE any investigation.** Reading source files, running `git`/`gh` archaeology, comparing worktrees, diffing PRs, and drafting clarifying questions are all **work** — not pre-work. The gate fires on **task recognition, not file modification**: "I'm only reading," "I'm just gathering context for questions," and "I haven't changed anything yet" are the exact rationalizations this rule forbids. Context for good questions is precisely what `/contextualize` loads, so it comes first. Skill-before-investigation, always.
- ⚠️ **NEVER modify OR INVESTIGATE any spec-governed file without invoking the required skills first** — "investigate" includes reading source, grepping, and `git`/`gh` archaeology. If a file touches specs, testing, code, architecture, or any topic covered by a skill (see `<skill_router>` below), invoke the relevant skill BEFORE reading or modifying it. Skills are the authoritative source — not grep results, not existing files, not your training data.
- ⚠️ **NEVER write code without invoking the `/apply` skill and following its 8-step workflow** - See skill table below
- ⚠️ **ALWAYS invoke `/apply` before implementing any spec-tree work item** - Applying is the orchestration skill for spec-tree TDD. It requires methodology/context loading, language-specific architecture, test, and implementation steps, plus blocking audit gates before the work can be treated as ready.
- ⚠️ **NEVER publish or merge spec-tree implementation or test changes without the applying audit gates** - For TypeScript work, `/apply` requires `test-evidence-auditor` to compose `/audit-typescript-tests` and `implementation-auditor` to compose `/audit-typescript-code` against an exact local checkpoint commit. Green tests and `pnpm run validate` are necessary but not sufficient for code/test changes.
- ⚠️ **NEVER write tests in `tests/`** - Write in `spx/.../tests/` (co-located with specs)
- ⚠️ **NEVER manually navigate `spx/` hierarchy** - Use `/contextualize spx/path/to/node` skill
- ⚠️ **Skills are ALWAYS authoritative over existing files** - When a skill template prescribes a structure (e.g., Architectural Constraints table), follow the skill — not patterns found in existing spec files. Existing files may contain non-standard sections added before skills existed. Never infer framework conventions from existing files; always read the skill.
- 🛑 **SKILLS DOMINATE. NOTHING BELOW THEM VOTES.** Skills > PDR/ADR > Spec > Test > Code. If a skill's examples are extensionless, imports are extensionless — even if 100% of the existing codebase has `.js` suffixes. Those files are in violation; they do NOT constitute precedent. Existing code is the LOWEST layer of truth and decides NOTHING about convention. Before citing "the existing codebase does X" as justification for anything, STOP. That sentence is never an answer to "why did you write it this way?" — the only valid answers are "the skill says so", "the ADR says so", "the spec says so", or "I was wrong." Grep is a research tool, never an authority.
- ⚠️ **NEVER maintain backward compatibility** - When rewriting a module, replace it entirely. No legacy aliases, no re-exports of old names, no shims. Update all imports across the codebase to use the new API.
- ⚠️ **NEVER reference specs or decisions from code** - No `ADR-21`, `PDR-13`, or similar in Python comments or docstrings. Specs are the source of truth; code should not duplicate or point to them. The `semgrep` rule enforces this.
- ⚠️ **NEVER edit `package.json` for dependency changes** - Use `pnpm add`/`pnpm remove` — they update package.json, lockfile, and venv atomically
- ⚠️ **NEVER use Husky for Git hooks** - Lefthook is the only hook runner for this repo. Do not run `husky`, add `husky`, create `.husky/`, or change `core.hooksPath` for Husky. `prepare` must install Lefthook, and `lefthook.yml` is the hook source of truth.
- ⚠️ **NEVER manually delete untracked files or empty directories** - Git doesn't track empty dirs; `.DS_Store` and `__pycache__` are gitignored artifacts. Use `pnpm run clean` to remove them
- ⚠️ **NEVER copy files when moving** - Use `git mv` to move files. This preserves git history. Never `cp` then delete the original.
- ⚠️ **NEVER use agents to create or modify ANY files** - Agents (subagents, background agents) must ONLY be used for read-only research: searching code, reading files, running read-only commands. ALL file creation, editing, and writing MUST happen in the main conversation context. Agents lack context, create unauthorized files, conflict on shared config, and make unasked-for changes.
- ⚠️ **NEVER `readFileSync` source files in tests** — if you want to read source files from tests you have understood absolutely nothing. Tests verify behavior — see `/test` and `/test-typescript` for methodology.
- ⚠️ **NEVER preserve, override, supersede, or refer to stale specs** — if you want to preserve, override, supersede or refer to no longer valid specs in any way, you have not understood durable map from `/understand`. Specs declare product truth. When the product changes, the spec is rewritten in place. There is no "superseded by" workflow.
- ⚠️ **A spec file is a pure declaration — its type opening (`PROVIDES … SO THAT … CAN …` or `WE BELIEVE THAT …`) plus `## Assertions` (typed, each carrying a `[test]`/`[eval]`/`[audit]` marker), and NOTHING else.** Never add prose, commentary, evidence-state notes, lifecycle narration ("while Declared", "applying converts this"), or workflow explanation. Atemporal voice: a spec states product truth, never narrates its own state or the process that will fill it. Such notes belong nowhere in the tree — not even in PLAN.md.
- ⚠️ **Numeric indices encode dependency order ONLY — lower = provider, higher = consumer, same = independent.** Never infer a "domain band", "foundation band", or any tier/zone from where existing nodes cluster; among dependency-valid indices the operator chooses. Reading a convention out of the current layout is the grep-is-not-authority violation in another guise.
- ⚠️ **A dependency edge B→A must rest on a recognized ordering-evidence type and be verified from the *consumer's* own spec — never inferred from directory clustering or a provider's `SO THAT X CAN …` prose alone.** The bases `/decompose` recognizes are provider/consumer service flow, logical prerequisite, **vertical-slice value delivery**, shared substrate, feature extension, and ADR/PDR constraint. Vertical-slice value delivery is first-class and load-bearing: a node depends on whatever its value cannot be delivered without — so release sits below every domain, because no capability reaches users unreleased. A verification-coupling check ("can B be verified WITHOUT A") diagnoses substrate/prerequisite edges but is NOT required of every edge; a vertical-slice edge holds even when B verifies fine in isolation. Reach for `/decompose` to settle any edge.
- ⚠️ **spx applied to spx is excluded from the dependency graph.** spx running its own domains on its own source (CI, `publish.yml`, `pnpm validate`/`test`) is self-application/dogfooding, not a spec-tree edge — encoding it makes a domain depend on itself through publishing (circular). Distinguish "a domain spx offers" from "spx applied to spx."
- ⚠️ **`[audit]` vs `[test]` is the verification MECHANISM, not a lifecycle marker.** In a spec file's `## Assertions`, a testable assertion carries `[test]` (its co-located test is written via `/apply`), `[eval]` for LLM-driven behavior with a structurally scoreable verdict, or `[audit]` (legacy spelling `[review]`) for judgment constraints no automated test can verify — never an `[audit]` "placeholder" for something testable. PDR and ADR `## Verification` rules instead carry the tag their template prescribes: under `### Testing` the evidence type (`[scenario]`/`[mapping]`/`[conformance]`/`[property]`/`[compliance]`), under `### Eval` `[eval]`, under `### Audit` `[audit]`.
- ⚠️ **NEVER discard or displace uncommitted work with `git checkout -- <path>`, `git restore`, `git reset --hard`, `git clean -f`, or `git stash`** — `git checkout -- <path>`, `git restore`, `git reset --hard`, and `git clean -f` discard uncommitted local changes irrecoverably; `git stash` hides them in the stash stack (recoverable, but it conceals in-progress state from concurrent agents). Hand these off to the user; if you need to discard changes, ask the user to do it.
- ⚠️ **NEVER `git reset` onto a remote-tracking ref (`origin/<base>`) — neither to rewrite your own commits nor to integrate the latest base** — `origin/<base>` moves as concurrent branches in the worktree pool merge, so resetting onto it silently re-bases your branch onto whatever it became; with `--soft` the working tree is left on the old basis while HEAD jumps forward, desyncing the tree (files present in HEAD show as deleted, files the new base changed show as modified, none of it your work). To reword or re-split your own commits, reset to a FIXED ancestor on your own branch — `git reset --soft HEAD~N` where N is the count of your own commits, or the fork-point SHA (`git merge-base HEAD origin/<base>`). To integrate the latest base, use `git rebase origin/<base>` (which updates the working tree), never a reset. After any history rewrite, verify `git diff --stat origin/<base>...HEAD` shows ONLY your intended files and `git status` has no surprise deletions; surprise files mean the base moved under you — STOP, do not commit.
- ⚠️ **NEVER force-overwrite a shared remote ref with plain `git push --force`** — it unconditionally overwrites history a concurrent agent may have advanced. The PR-branch flows use `git push --force-with-lease` (which refuses when the remote advanced) instead, per the rule below.
- ✅ **The `/merge` lifecycle and its internal opening/managing flows own their own PR branch's history** — per `/merging-standards`, the lifecycle autonomously rebases the current PR branch onto its base (`git rebase origin/<base>`), pushes the rebased branch with `git push --force-with-lease` (never plain `--force` — `--force-with-lease` refuses when the remote advanced, so it cannot clobber a concurrent push), merges via `gh pr merge --rebase`, detaches the worktree onto the refreshed base tip, and deletes the merged PR branch locally and remotely. These are governed, single-author-branch operations, not the work-discarding operations above.
- ⚠️ **STOP TRIGGER: about to run `pnpm exec tsc --noEmit`, `npx tsc`, or any bare type-check command** — run `pnpm run typecheck` instead. Bare `tsc` misses product-specific config, paths, and exclusions. This applies to every TypeScript check, not just commit-time.
- ⚠️ **ALWAYS run the documented pnpm validation scripts after code changes** — before audit, before commit, before claiming "done". `pnpm run typecheck` alone is not the quality gate — it runs only TypeScript checking. Run `pnpm run validate` for source validation, plus the relevant tests. Circular dependency detection runs in CI, not as a local gate.
- 🛑 **STOP TRIGGER — running tests. NEVER run the full suite to verify a change; run the touched scope through `spx test`.** `pnpm test` (and `spx test` with no operands) runs ~2100 tests — minutes idle, up to ~20 minutes under machine load, and agents looping it during PR cycles exhaust the host. The product has ONE test verb, `spx test`; pick a **situation**, not a runner:
  - **Verify work in progress** → `spx test --changed [--base origin/main]` — focused by the branch/worktree diff (`spx/41-test.enabler/95-changed-set-planning.enabler`), or `tsx src/cli.ts test --changed [--base origin/main]` when changing `spx test` itself on this branch (the global `spx` runs `main`'s stale build). To force one known node or file, use `spx test spx/<node>` or `spx test spx/<node>/tests/<file>`.
  - **Read status without running** → `spx spec status` (reads recorded evidence; runs nothing).
  - **CI gate / status projection** → `spx test passing` — CI's job (`.github/workflows/deterministic-verification.yml`), not a local routine.
  - **Deliberate full local run (rare)** → `pnpm test`, only with a specific written justification (e.g. a cross-cutting change whose touched scope cannot cover the contract — the same escalation `/merging-standards` governs).
  - **Coverage / watch** → `pnpm run test:coverage` / `pnpm run test:watch` — raw vitest, the human-interactive gaps `spx test` does not yet cover; not agent paths.
    NEVER reach for raw `pnpm exec vitest run` / `vitest` as an agent test path — `spx test` is the one verb.
- ⚠️ **NEVER mechanically extract typed literal union values to named constants** — `no-restricted-syntax` warnings on `expect(x).toBe("declared")` where `x: NodeState` are false positives. The type annotation IS the documentation; renaming `"declared"` → `STATE_DECLARED` adds zero information. The lint rule targets magic strings whose meaning is obscure; enum-like union members are already self-documenting. Suppress the warning inline or leave it; never rename. The `typescript:auditing-typescript-tests` skill's Gate 0 C1/L1 findings for typed protocol values (`"PASS"`, `"FAIL"`, `"APPROVED"`, `"REJECT"`) are the same class of false positive — a Gate 0 REJECT on these strings is not a work blocker when `pnpm run validate` passes and tests pass.
- ⚠️ **ALWAYS research related codebases before offering architectural options** — before presenting A/B/C choices via `AskUserQuestion`, grep/read related codebases (sibling monorepo paths like `~/Code/CraftFinal/root/`, existing `src/spec/apply/`, etc.) for established patterns. If a pattern already exists there, reference it rather than reinventing. "Read the existing code" beats any combination of options you can invent.

- ✅ **ALWAYS `git mv` when moving tracked files** - Never `cp` then `git add`. `git mv` preserves history. Use `git mv -f` when the target exists.
- ✅ **When uncertain, ASK STRUCTURED QUESTIONS. Never guess implementation patterns, test methodology or requirements.**
- ✅ **Use `AskUserQuestion` for structured questions with predefined options.** Do NOT use it for open-ended questions where the user needs to provide free-form context — just ask in plain text instead.
- ✅ **When interviewing the user, use multi-round structured questions where each round constrains the solution space.** Never present a draft and ask yes/no approval. Each question should surface a genuine design decision with distinct options that lead to materially different outcomes. After 3–4 rounds, the solution space is narrow enough to draft confidently.

## Product Language

- ✅ **Refer to this repository as the product, not a project** — Spec Tree is a durable map of product truth, while "project" language implies a temporary effort whose purpose is completion. In prose, prefer "product", "product repository", "product root", and "product directory".
- ✅ **Prefer `productDir` for new root-directory variables and harness APIs** — do not introduce `projectDir` for the repository/product root in new code, tests, fixtures, or documentation. When already editing an owning harness or API, rename `projectDir` to `productDir` as part of that coherent change.

---

## Spec Management

The **spec-tree** plugin is the active system for managing specification trees. Core skills:

<skill_router>

| Skill            | Purpose                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `/understand`    | Load methodology foundation (node types, ordering, assertions)     |
| `/contextualize` | Load context for a specific node (walks tree to target)            |
| `/author`        | Create specs, ADRs, PDRs, enablers, outcomes                       |
| `/decompose`     | Break nodes into children with proper ordering                     |
| `/test`          | Manage spec-test lock file lifecycle                               |
| `/apply`         | Orchestrate spec-tree implementation and audit gates               |
| `/refactor`      | Restructure the spec tree (move, consolidate, extract)             |
| `/align`         | Review for gaps, contradictions, and consistency                   |
| `/merge`         | Route PR lifecycle work through opening, managing, and merge gates |

Additional skills ship with the plugin and are invoked by name: `/commit-changes`, `/interview`, `/audit-tests`, `/audit-pdr`, `/audit-adr`, `/audit-specs`, `/handoff`, `/pickup`, `/refocus`, `/bootstrap`, `/open-pr`, `/manage-pr`, `/merge`, `/sync-base`, `/merging-standards`, `/diagnose`. See the spec-tree plugin's `skills/` directory for the full list.

</skill_router>

<skill_sources>

HARD STOP: Like every directory outside the current `$CWD`, the Outcome Engineering plugin repository is OFF LIMITS.
Access it read-only only to inspect plugin behavior and form improvement suggestions, or to hand off a session containing those suggestions.
Never edit, branch, commit, test, audit, PR, or merge there; a separate session in that repository has its own instructions.

Outcome Engineering plugin skills live in the plugin repository resolved by:

```bash
claude plugin marketplace list | sed -nEe 's#.*Directory.*\((.*outcomeeng.*)\).*#\1#p'
```

If a file under that resolved repository, or a generated/cache copy of those plugin files, appears wrong, stale, incomplete, unsafe, confusing, or responsible for incorrect workflow behavior, do not edit it from this product workflow.

Instead, create follow-up work in the plugin repository:

1. Resolve the plugin repository with the command above.
2. Go to that repository's default checkout.
3. Get it current with `origin/main`:
   `git checkout --detach origin/main`
4. Run `spx session handoff` from that checkout.
5. In the handoff, describe what happened, what was unclear, what you checked, and what facts would help the future plugin workflow.

Do not prescribe exact code, documentation, or template changes. Record the mistaken assumption, the trigger that led to it, and the facts that would help the plugin-repository workflow target the misconception precisely.

</skill_sources>

### Decision records: the decision-first ADR/PDR template

**Legacy verbose decision records are no longer valid.** Any ADR or PDR carrying `## Purpose`, `## Context`, a `## Decision` heading, `## Trade-offs accepted`, a `## Compliance` block, or the PDR-specific `## Product invariants` heading (the template's heading is `## Product properties`) — or blanket `[review]` tags — is in violation of the current template and slated for migration to the decision-first shape. It is NOT precedent: do not copy its structure, and never cite it to justify a new or migrated decision record's shape. When the spec-tree reviewer compares a decision-first file against a still-legacy sibling, the legacy sibling is the file in violation.

**Decision records carry the detail their reach requires — they are placed so contextualization reads them as a node's governing context.** `/contextualize` loads the product spec plus the ADRs and PDRs along the path to a target node as that node's governing context, and by numeric-index order a decision record reaches its higher-index siblings and their descendants (lower index = provider, read by the higher-index consumers — see the numeric-index dependency-order rule in **Critical Rules** above). A decision record must therefore carry the specific detail the nodes in its reach need to do their work, including mechanism, path, and command detail that, read in isolation, can look like implementation belonging in a node or in code. That detail is governing context, and reach follows index placement: a record is indexed below the nodes that consume it so they read it, so pushing such detail down into a node narrows its reach to that node's own subtree, and removing it starves the dependent nodes' context. Do not flag a decision record's detail as misplaced merely because it names a git command, a file path, or a module; judge whether the nodes in its reach need that detail as context.

- `spx/15-worktree-management.pdr.md` sits at the product root below the domains that resolve a root or address `.spx/` — the state, session, compact, worktree, validation, and release enablers are all indexed above 15 — so its root-resolution detail (which `.spx/` state class resolves to which root, and the `git rev-parse --git-common-dir`, `git rev-parse --show-toplevel`, and `git config --get core.bare` mechanisms behind them) reaches each of them as context.
- `spx/18-state.enabler/11-state.pdr.md` heads the state enabler below its sibling state nodes, so its `.spx/` storage contract — the `.spx/branch/{branch-slug}/`, `.spx/worktree/`, and `.spx/sessions/{todo,doing,archive}/…` path formats — reaches every state node that reads or writes that store.

---

## Validation and Publish Gates

**NEVER commit without passing source validation. NEVER publish without passing the publish gate.**

```bash
# Quick verification before committing
# Source validation for current TypeScript source
pnpm run validate

# plus the focused tests that cover the touched spec node, source module, or workflow

# Build packaged output for the `spx` executable
pnpm run build

# Publish gate: source validation, circular validation, build, tests, packaged validation, packaged circular validation
pnpm run publish:check
```

`pnpm run validate` and related development scripts execute `tsx src/cli.ts`, so they validate the current source tree even when `dist/` exists. The packaged executable `bin/spx.js` requires `dist/cli.js`; invoke it only after `pnpm run build`.

Local deterministic verification follows `/merging-standards`: run validation and tests for the touched scope by default. Full-repository local testing is CI's job unless the governing node, product overlay, or risk evidence requires a wider local run, such as changes to validation infrastructure, test runner wiring, generated distribution, package-manager configuration, shared runtime code, or a broad refactor whose touched-scope commands cannot cover the contract. Circular dependency detection is a whole-graph check that runs only in CI, never as a local pre-commit or pre-push gate.

### Verification Checkpoint Checklist

Before creating a local checkpoint commit for agentic verification:

- [ ] **`/apply` context is loaded and the diff is stabilized**: methodology/context loaded and obvious contradictions resolved before dispatching auditors
- [ ] **`pnpm run validate`** passes (source CLI aggregate pipeline, circular skipped)
- [ ] **Focused tests for the touched scope** pass; widen only when `/merging-standards` escalation applies

### Pre-Push Checklist

Before pushing:

- [ ] **`test-evidence-auditor` approved TypeScript test changes** after composing `/audit-typescript-tests` against the exact committed head
- [ ] **`implementation-auditor` approved TypeScript implementation changes** after composing `/audit-typescript-code` against the exact committed head
- [ ] **`changes-reviewer` converged** on the exact committed head when `/apply` classifies the changeset as cross-node
- [ ] **`pnpm run build`** succeeds
- [ ] **`pnpm run validate`** passes
- [ ] **Focused tests for the touched scope** pass on the tree being pushed; widen only when `/merging-standards` escalation applies

### Pre-Publish Checklist

Before publishing or tagging a release:

- [ ] **`pnpm run publish:check`** passes, including packaged validation and packaged circular validation
- [ ] The version in `package.json` matches the release tag

### Releasing CLI-surface changes (interim — remove when the `/release` skill ships)

When a changeset reaching `main` adds a new CLI subcommand, verb, or option, merge completes the PR and then release work begins: drive a release, autonomous up to the publish gate.

Run every release step in the canonical main checkout defined by `spx/15-worktree-management.pdr.md`. That checkout permanently keeps `main` checked out, which makes Git refuse attempts to check out `main` in a linked worktree. Never detach the canonical main checkout, switch it away from `main`, or move `main` to another worktree. Stop the release if the canonical main checkout cannot remain on `main`.

Agent release sequence:

1. In the canonical main checkout, confirm `git branch --show-current` reports `main`, sync it to `origin/main` via `/sync-base`, and run `pnpm version patch --no-git-tag-version` unless directed otherwise. This updates `package.json` only.
2. Run `pnpm run publish:check`.
3. Use `/commit-changes` to commit `build(release): bump version to X.Y.Z` on `main`.
4. Tag `vX.Y.Z` with `git tag vX.Y.Z`.
5. Push both refs with `git push origin main && git push origin vX.Y.Z`. The `main` push is fast-forward only; never use `--force`.
6. Pause and ask the operator to approve the `vX.Y.Z` run's `npm-publish` deployment. This is the human checkpoint the environment gate exists for.
7. After approval, verify the registry with `npm view @outcomeeng/spx version` and provenance with `npm audit signatures`.
8. Complete the operator-visible CLI update in the canonical main checkout: run `git fetch --tags origin`, confirm `git branch --show-current` still reports `main`, and require `git rev-parse HEAD`, `git rev-parse origin/main`, and `git rev-parse "vX.Y.Z^{commit}"` to return the same commit. Run `pnpm run build` and verify `spx --version` reports `X.Y.Z`. If either local or fetched `main` advanced beyond the release tag, report the three commit IDs, leave the CLI unchanged, and complete the refresh through a later release that starts from newly synced `main`; never move `main` backward to retry the old release.

Do not refresh the CLI with `pnpm install`, global `pnpm add -g`, or package-manager update commands during release close-out.

### Release request protocol

When the user asks to prepare or publish a release, follow `README.md` "Publishing a Release" and `.github/workflows/publish.yml` as the current manual release procedure for publishing this package. Use those two surfaces as the package-publishing authorities.

For agent execution, treat README shell commands as the human-operator form of the procedure. Apply this file's agent rules while carrying out the same release sequence: sync through `/sync-base` and commit through `/commit-changes`. When a release request also satisfies the "Releasing CLI-surface changes" trigger, follow that section for the agent execution path.

Report deterministic PNPM gate evidence explicitly. A valid release status update names `pnpm run publish:check` and summarizes every stage it ran: source validation, circular dependency validation, build, tests, packaged validation, and packaged circular dependency validation.

Report the exact version bump command too. Use `pnpm version patch --no-git-tag-version` unless the release request specifies `minor`, `major`, or an exact version.

If the publish gate exits 0 with warning-level lint output, report the warning count and continue. Do not turn tracked warning debt into a release blocker.

### Committing Changes

**ALWAYS use the `/commit-changes` skill to commit.** Never run raw git commands for commits.

```bash
# Correct: invoke the skill
/commit-changes

# Wrong: manual git commands
git add . && git commit -m "..."
```

### Available Validation Commands

The pnpm scripts below are the agent-facing workflow interface for local validation and publish gates:

| pnpm Script                   | Purpose                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm run validate`           | Source aggregate validation, circular skipped                                                    |
| `pnpm run validate:published` | Built executable validation, circular skipped                                                    |
| `pnpm run publish:check`      | Source validation, circular, build, tests, packaged validation, and packaged circular validation |
| `pnpm run lint`               | ESLint only                                                                                      |
| `pnpm run lint:fix`           | Auto-fix ESLint issues                                                                           |
| `pnpm run typecheck`          | TypeScript only                                                                                  |
| `pnpm run circular`           | Source circular dependency detection                                                             |
| `pnpm run circular:published` | Built executable circular dependency detection                                                   |
| `pnpm run knip`               | Find unused code                                                                                 |

### Formatting Commands

Use the product scripts for formatting. Run `pnpm run format` to apply `dprint fmt .`, and run `pnpm run format:check` to verify formatting without modifying files. Never invoke Prettier directly or through `pnpm exec prettier`; Prettier is not part of this product's formatting toolchain.

**Common validation operands and options:**

- `<paths...>`: Specific files/directories to validate, supplied as positional operands after command options
- `--quiet`: Suppress progress output
- `--json`: Output results as JSON

**Scoping literal findings to a subtree:**

`pnpm run validate` runs the aggregate validation pipeline with circular dependency detection skipped; circular dependency detection runs in CI rather than as a local gate. Literal output can still flood when there are many findings. To see only the files with problems in a specific subtree:

```bash
# Files with literal problems in a subtree
tsx src/cli.ts validation literal --files-with-problems | grep spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler

# All literal findings in a subtree (with line numbers)
tsx src/cli.ts validation literal | grep spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler
```

`--files-with-problems` emits one unique file path per line — pipe through `grep <prefix>` to scope to a node.

---

## Pull request (PR) audit workflow

Use small PRs with one purpose. A PR that changes specs, tests, architecture, runtime code, deployment, and publishing workflows at once is too hard to review and too easy to merge for the wrong reason. Split the work into the smallest reviewable concern that can pass its own local gate.

Run the right local gate before publishing. Use the documented pnpm validation scripts for default gates and add targeted tests for the node or workflow changed; circular dependency detection runs in CI, not locally. Name those commands in the PR body.

### PR review guidance

`/merge` is the active default-branch lifecycle. It selects transport, delegates to PR opening and managing flows, and classifies automated and human findings by required receiver action using only `BLOCKING` and `DEBT`.

`BLOCKING` and `DEBT` enter the active PR loop and must be fixed in the same PR.

Treat PR-level comments as authoritative review surfaces. This product receives inline review-thread comments. A reviewer comment posted in the PR conversation with `BLOCKING` or `DEBT` findings is a review for the managing-PR gate even when the formal review list and inline review-thread list are empty. Still inspect all three surfaces on every PR pass:

- Formal reviews and PR-level comments via `gh pr view <pr-number> --json reviews,comments`
- Inline review-thread comments via `gh api repos/{organization}/{repo}/pulls/<pr-number>/comments --paginate`
- Check results via `gh pr checks <pr-number>` and the PR `statusCheckRollup`

**Validate every review-bot citation against the cited authority before complying — a finding whose cited rule does not exist is an invalid hallucination, not a defect to fix.** The `spec-tree-review` bot reviews from its own system prompt and at times misattributes one of its own prompt rules to this repository's root instruction files. The recurring instance is a comment-style rule — phrased like "Default to writing no comments", "never write multi-line comment blocks", or "one short line max" — cited as `CLAUDE.md` or `AGENTS.md`. No such rule exists in this product's root instruction files (`grep` them to confirm); multi-line comments that capture a non-obvious WHY are permitted here. Reject any `DEBT`/`BLOCKING` finding that cites a root-instruction comment-length or no-comments rule: the citation does not support it, so it carries no receiver action. This is the general rule applied — drop any finding whose cited rule the actual authority does not contain.

### Executing PR workflow

Run `/merge` for default-branch changes. It opens PRs ready once `REVIEW_READINESS` holds: the product's scoped deterministic verification passes, every required audit gate for the changed artifacts has approved, and local `changes-reviewer` review has converged. Review also runs on the ready PR in CI. If the operator explicitly suspends local reviewer agents for resource protection, treat that as a documented exception: do not run `changes-reviewer` locally, name the exception in the PR body, and let CI be the first review surface. The managing phase drives the merge loop: inspect all review surfaces, classify findings, sync to base when needed, fix `BLOCKING` and `DEBT`, rerun the local closure gate before pushing, wait with `gh pr checks <pr-number> --watch --fail-fast --interval 30` when checks or reviews need time, and evaluate the merge authority gates.

```bash
pr_url="$(gh pr create --title "$title" --body "$body" --base main --head "$branch")"
pr_number="${pr_url##*/}"
```

```bash
gh pr checks "$pr_number"
gh pr view "$pr_number" --json reviews,comments
# Replace {organization}/{repo} by the actual organization and repository names
gh api "repos/{organization}/{repo}/pulls/${pr_number}/comments" --paginate
```

Do not add or substitute ad hoc waits such as shell polling loops, `sleep`, manual babysitting, repeated manual refreshes, or invented waiting schemes. Skills have precedence. When checks or reviews need time, use the managed PR check wait command from `/merging-standards`: `gh pr checks <pr-number> --watch --fail-fast --interval 30`, then re-inspect PR state, check rollup, PR-level comments, formal reviews, and review-thread comments before acting.

### Ask for adversarial PR audit

Ask the PR reviewers for adversarial auditing of all architecture, security-sensitive workflows, deployment and publishing paths, and any PR that changes production behavior. When checks or reviews need time, use `gh pr checks <pr-number> --watch --fail-fast --interval 30`, then run the full managing inspection before acting. Continue with non-blocking local work only when it does not overlap with the PR wait or review surface.

### Treat PR review findings by receiver action

- Fix `BLOCKING` findings in the same PR, rerun the focused tests and relevant pnpm validation scripts, then update the PR.
- Fix `DEBT` findings in the same PR, rerun the focused tests and relevant pnpm validation scripts, then update the PR.
- Findings that expose weak evidence require a test rearchitecture using the `/test-typescript` skill before merge.

### Merge discipline

- Merge stacked PRs in dependency order.
- Do not deploy or publish from unmerged PR branches.
- Use selective staging and one commit per concern before pushing using the `/commit-changes` skill.
- After merge, sync local `main` and verify the worktree is clean before starting the next branch using the `sync-base` skill.

---

## Technical Stack

- **Language**: TypeScript (ESM)
- **Build**: tsup (esbuild-based)
- **Testing**: Vitest
- **CLI**: Commander.js
- **CI/CD**: GitHub Actions with OIDC Trusted Publishing and Sigstore provenance

## Development

See the [Development section in README.md](README.md#development) for setup, build, and test commands.

### Which `spx` to invoke

Two different things are named `spx`; they are **not** interchangeable.

- **`spx` (on `PATH`)** runs the **`main` worktree's built `dist/cli.js`**. `pnpm add -g .` registers that worktree's package in the global pnpm store and symlinks it there, so the shim at `~/.local/share/pnpm/bin/spx` resolves through `~/.local/share/pnpm/global/v11/<hash>/node_modules/@outcomeeng/spx/bin/spx.js` to the `main` worktree's `bin/spx.js` → `dist/cli.js`. It is therefore a *build snapshot*: only as current as the last `pnpm run build` in the `main` worktree, and it never reflects a feature worktree's in-progress source. It is **shared infrastructure — agents and sessions across many repositories depend on `spx` being on `PATH`.** Keep it present and healthy; never route around it.
- **`tsx src/cli.ts …`** (and the `pnpm run` wrappers that call it — `pnpm run validate`, `pnpm run lint`, …) runs the **current worktree's live source**, no build step. It always reflects exactly what you are editing. (`pnpm test` is not one of these wrappers — it is `pnpm run build && vitest run`, the build-first full suite the running-tests STOP TRIGGER governs.)
- **`node bin/spx.js …`** (`pnpm run validate:published`) runs the current worktree's built `dist/` — the packaged-artifact gate; requires `pnpm run build` first.

Choose by what the command's result depends on:

| Task                                                                      | Invoke                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validate / lint / typecheck / `spec status` of work in progress           | `pnpm run <script>` or `tsx src/cli.ts …` — current source; a global `spx` would test `main`'s stale build                                                                                                                                                                                                                                              |
| Run tests for work in progress                                            | `spx test --changed [--base origin/main]` — diff-selected touched scope only (use `tsx src/cli.ts test --changed [--base origin/main]` when changing `spx test` itself on this branch); use `spx test spx/<node>` only to force one known node. NEVER `pnpm test` to verify a change — a full-suite run needs the written-justification carve-out there |
| Any command whose behavior you are changing on this branch                | `tsx src/cli.ts …` — exercise the live code, never a build                                                                                                                                                                                                                                                                                              |
| Stable operational commands — `session handoff`/`list`/`pickup`/`archive` | `spx …` on `PATH` — canonical; `.spx/` state resolves to the shared common-dir from any worktree CWD                                                                                                                                                                                                                                                    |
| Validate the published executable (release gate)                          | `pnpm run build`, then `pnpm run validate:published`                                                                                                                                                                                                                                                                                                    |
| In doubt                                                                  | `tsx src/cli.ts …` — always correct (live source)                                                                                                                                                                                                                                                                                                       |

**NEVER substitute `tsx src/cli.ts` for `spx` because you assume `spx` is missing.** `spx` must always be on `PATH`; a failing `command -v spx` is a break to repair immediately (below), not a condition to route around.

#### Fixing the global `spx`

`pnpm link --global` was **removed in pnpm 11**; (re)create the global `spx` with `pnpm add -g .`, run from the **`main`** worktree (locate it with `git worktree list` — the one on `[main]`).

- **Missing or broken** (`command -v spx` returns nothing, or `spx` errors): restore it immediately — external dependents rely on it. From the `main` worktree:

  ```bash
  git pull        # update main
  pnpm install
  pnpm run build  # ensure dist/cli.js exists — the global shim resolves bin/spx.js -> dist/cli.js
  pnpm add -g .   # register this package globally; the shim is symlinked from main
  # first run on a machine: if `pnpm add -g .` errors about the global bin directory,
  # run `pnpm setup`, restart your shell, then re-run `pnpm add -g .`
  which spx       # verify
  ```

- **Stale** (present but an old build that lags `origin/main`): the global `spx` is symlinked from the `main` worktree, so refresh that worktree's `dist/` — its Lefthook `post-merge`/`post-rewrite` `rebuild-dist` hook rebuilds on pull:

  ```bash
  git pull        # in the main worktree; fires rebuild-dist
  # or, if already current: pnpm run build
  ```

Because the global `spx` tracks the `main` worktree's build, feature worktrees use `pnpm run` / `tsx src/cli.ts` for their own work and never rely on `spx` reflecting uncommitted or unmerged changes.

### CLI build and git-hook gotchas

These recur on feature worktrees and have cost real debugging time and machine stability — internalize them before running CLI tests or pushing.

- **L2 CLI tests exercise the built `dist/`, not source.** Any `spx/**/tests/*.l2.test.ts` shells out to `node bin/spx.js` → `dist/cli.js`. Run `pnpm run build` before trusting an L2 result. The Lefthook `rebuild-dist` hook rebuilds only on the **main** worktree — it prints `rebuild-dist: skipped (non-main checkout)` on feature/linked worktrees — so after editing source or rebasing in a feature worktree, `dist/` is stale. A "failing" L2 test (e.g. an assertion seeing old output) is most often just stale `dist/`; rebuild and re-run before treating it as a real failure.
- **`spec status --update` reprojects *every* node from recorded test evidence, so on a stale-`dist` feature worktree it flips sibling `spx.status.json` files `passed`→`failed` for nodes you never touched** — the same stale-`dist` L2 artifact as above, now propagated into committed status files. NEVER restore, discard, or commit such a flip on the assumption it is spurious, and NEVER ask the operator to discard it. Rebuild with `pnpm run build`, re-run the affected nodes' tests (`tsx src/cli.ts test spx/<node> …`), then re-run `spec status --update`. A fresh-`dist` re-run is the only arbiter: if a node still projects `failed` after it, the failure is real and the change broke it. Status projection is CI's job (`Test + status projection`, on fresh `dist` over the full suite); locally, treat cross-node status drift as a build-staleness signal to re-run, not a set of files to revert.
- **`spx.status.json` is a DERIVED artifact — its only writer is `spec status --update` (`src/lib/node-status/update.ts`). NEVER hand-edit its `passed`/`failed`/`not-run` outcome values.** Typing an outcome by hand fabricates the projection — the quality-gate-cheating anti-pattern — and the CI `Test + status projection` job re-derives the file regardless, so a hand-written value is both dishonest and futile. Producing a status means running the projector, never editing the file. Graduating a node out of `spx/EXCLUDE` is therefore NOT a one-line change: in this product `spx/EXCLUDE` gates markdown validation of the node's own spec file AND the `isExcluded` classification fact, and `spec status --update` writes every outcome as `not-run` for an excluded node (`update.ts` `resolveVerification`) but the node's REAL outcomes once it is unexcluded. Because the CI gate fails on any drift between the committed `spx.status.json` and the fresh projection, graduation is: remove the `spx/EXCLUDE` entry, then REGENERATE the committed status by deriving it on fresh `dist` over the full suite through the current-worktree entry point — never the global `spx` shim, which runs `main`'s stale build and would record status from the wrong source (`pnpm run build` → `tsx src/cli.ts test passing` → `tsx src/cli.ts spec status --update`, the same entry point CI's `Test + status projection` uses) — and verify the diff touches only the graduated node's `spx.status.json` (`not-run` → `passed`) plus the `spx/EXCLUDE` line. Never hand-write the `passed` values to skip the projector.

<!-- /SPEC-TREE:shared root -->

## Architecture

```
src/

├── agent/         # Agent SDK boundary (injected AgentRunner for agent-authored artifacts)
├── commands/      # CLI command implementations
│   ├── session/     # spx session subcommands
│   ├── spec/        # spx spec subcommands
│   └── validation/  # spx validation subcommands
├── interfaces/
│   └── cli/         # Commander registration descriptors and CLI boundary primitives
├── domains/       # Domain logic
│   ├── agent-environment/
│   ├── audit/
│   ├── config/
│   ├── release/         # Release data and agent-authored release notes
│   ├── session/
│   ├── spec/
│   └── validation/
├── validation/    # Lint, typecheck, circular dep logic
├── session/       # Session lifecycle and storage
├── config/        # Configuration loading
├── git/           # Git integration utilities
├── scanner/       # Directory walking, pattern matching
├── status/        # Status state machine
├── reporter/      # Output formatting
├── tree/          # Hierarchical tree building
├── precommit/     # Pre-commit hook orchestration
└── lib/           # Shared utilities
```
