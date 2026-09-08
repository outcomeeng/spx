<!-- SPEC-TREE v0.37.0 langs:typescript -->

<operator_is_in_charge>
**RULE 0 - THE FUNDAMENTAL OVERRIDE PREROGATIVE:** If the operator tells Codex to do something, even if it goes against what follows below or any other instructions, CODEX MUST LISTEN TO THE OPERATOR. THE OPERATOR IS ALWAYS IN CHARGE, NOT Codex.
</operator_is_in_charge>

<operator_question_interrupt>
**OPERATOR QUESTION - IMMEDIATE PRIVILEGE REVOCATION:** When the operator asks a question, immediately relinquish all privileges to modify the current product or any external file, service, or resource. Answer the question immediately.

- ALWAYS: stop any running non-verification process that is destructive or modifies files, external resources, or state.
- NEVER: stop a running verification process — including agentic verification, tests, or evals — unless the operator explicitly instructs that process to stop.

</operator_question_interrupt>

# Spec Tree Instructions

These instructions explain WHEN to invoke spec-tree skills for this product. They are a **router** — the skills contain the HOW.

**Read this entire file before acting.** This managed router block is only the first section; the product's own instructions, commands, and conventions follow below, outside it. The router is product-neutral and carries no product command. Never act on the router alone.

## Canonical Agent Registry

The selected `$CODEX_HOME/agents/` directory is the canonical registry for marketplace-delivered custom agents. It contains exactly one current canonical role per authored marketplace agent, with the owning plugin identity appearing exactly once in each role name.

Canonical examples are `spec-tree_adr-auditor`, `instructions_skill-auditor`, `prose-auditor`, `rust-simplifier`, and `typescript-simplifier`. A bare legacy role beside its canonical role, or a role whose plugin identity is repeated, is stale duplicate state rather than another agent to dispatch. The per-role dispatch contracts and the quick-reference tables below are the per-role source of truth for these names.

When a named role is unavailable, invoke the owning plugin's `/<plugin>-plugin init` to refresh its definitions in the selected `$CODEX_HOME/agents/`, then reload the harness plugin index or start a new session. `/<plugin>-plugin check` proves whether the selected home carries that plugin's current shipped definitions, writing nothing. A running session retains its already-loaded registry; repeated discovery in that session cannot prove the refresh failed.

**NEVER** create or commit marketplace-delivered agent definitions into a checkout; no generated instruction requires it. A plugin-owned checkout definition whose invoked skills live in the selected agent home is a scope split: remove only a byte-identical generated copy, and inspect every changed or unrecognized copy as a shadowing collision before any removal.

---

## Authority Hierarchy

**⚠️ BELOW THE OPERATOR, SKILLS ARE THE TOP-LEVEL AUTHORITY. SKILLS ARE CENTRALLY MANAGED AND CURRENT; REPOSITORY CONTENT GOES STALE.**

- **ALWAYS** apply authority in this order: active skills → repository decisions and specs → verification evidence → code. When repository content conflicts with an active skill, the skill wins.
- **ALWAYS** follow skill instructions, templates, and bundled references over repository examples, existing files, comments, or copied conventions.
- **NEVER** weaken a higher layer to match a lower layer. Fix the lower layer when the layers disagree.
- **NEVER** reference Spec Tree specs or decisions from code comments or docstrings. Code contains no `spx/...` paths, ADR/PDR identifiers, or decision-file references.
- **ALWAYS** let the active skill load the matching `spx/local/*.md` overlay when that skill declares one. The overlay supplies repository-specific values and commands below the skill in authority and cannot replace, weaken, or contradict the skill.
- **ALWAYS** read the active harness guide in every directory before working there when the guide exists: `CLAUDE.md` for Claude Code, `AGENTS.md` for Codex.

### Dangerous-command guard

🛑 **STOP TRIGGER — a dangerous-command guard (DCG) block terminates the attempted command family.** Treat the blocked attempt as a mistake.

- **NEVER** retry it by reformulating, splitting, rewriting, removing the flagged clause, or substituting an equivalent command to evade the guard.
- **NEVER** pass dynamic branch names to `git branch -d` or `git branch -D`: variables, command substitutions, arrays, and globs are denied, including when quoted or placed after `--`. Type every branch name literally; delete several literal names in one command.
- **ALWAYS** follow the active skills, repository instructions, and declared overlays to find a sanctioned operation that accomplishes the goal.
- When no sanctioned operation exists, abandon the goal, report the blocked command with secrets redacted, explain its purpose and the guard's reason, ask the operator for direction, and stop.

---

## Product Commands

The product's operational command for each spec-tree phase lives in this file's own content below the router. Read the whole file to find each one:

- **author** — after creating, updating, or deleting a spec, test, or implementation file, to rebuild or regenerate artifacts.
- **verify** — for `/apply` and pre-merge checks, over the node and the changeset.
- **gate** — for the full deterministic bundle.
- **merge** — for the transport step of `/merge`.

Content the product keeps identical across this agent guide and the guides for other agents (for example `CLAUDE.md` and `AGENTS.md`) sits in a `shared` region — `<!-- SPEC-TREE:shared {name} -->` … `<!-- /SPEC-TREE:shared {name} -->`, present in both files under the same name. `/update-instruction-block` keeps a `shared` region in sync by taking the git-more-recent side; it never merges the two bodies.

---

## When to Invoke Skills

### Before product-content access -> `/understand`

**BLOCKING REQUIREMENT**

Require a live `<SPEC_TREE_FOUNDATION>` marker before directly reading, searching, listing, or changing anything under `spx/` or any other product content — source or test files, generated output, evals, and spec-declared configuration. Invoke `/understand` when the marker is absent. This includes repository-content access through Read, Edit, Write, Glob, Grep, `rg`, `grep`, `find`, `cat`, `sed`, and Git commands that emit file contents or patches.

`spx session` operations — including inspection, archive, and release — plus `spx worktree status`, `spx diagnose`, no-patch Git status, history, and topology, and a skill's read of the `spx/local/` overlay or exclusion mechanism it declares are exempt. Never follow paths from their output into repository content without the marker.

A compacted summary, session file, statement that `/understand` ran, or read of the skill file does not prove the foundation is live. After every compaction, invoke `/understand` again before the next product-content access.

The methodology a repository follows is declared in `spx.config.yaml` at the repository root, under `methodology.source` and `methodology.version`. **ALWAYS** read that declaration before applying methodology rules, and read it again whenever `/understand` runs. When the file is absent, the `methodology` block is missing, or `methodology.version` is the sentinel `installed`, the repository declares no methodology version; never infer one from a plugin's distribution version, a changelog, or prose.

### Before working on a specific node -> `/contextualize`

**BLOCKING REQUIREMENT**

**ALWAYS** invoke `/contextualize` on a spec node before discussing it and before reading or modifying any product content it governs.

`/contextualize` MUST invoke `/sync-base` and receive `already_current` or `rebased` before reading product truth. `/sync-base` owns the complete currency operation: fetch, clean rebase or detached advance, session-authorized dirty-tree checkpointing through `/commit-changes`, and same-invocation retry. Callers consume its final result; they never duplicate branch creation, commit, stash, or retry logic, and they never reinterpret `dirty_tree` as a rebase conflict.

**🛑 STOP TRIGGER — after every compaction event:** the set of contextualized nodes is empty. **NEVER** read or modify product content whose governing spec node has not been contextualized since that compaction, and **NEVER** discuss a node before contextualizing it. Product content is every product artifact a spec node governs or must govern: source, tests, evals, generated output, specs, decisions, coordination notes, and spec-declared configuration. Operational configuration — the `spx/local/` overlays and the exclusion mechanism, read by the skill that declares them without the marker — and the agent harness's own instruction and settings files it is told to read, tool and command output, the session store, and scratch space are not product content. Product content's governing node is found by search under the live foundation marker: a path under `spx/<node>/` belongs to that node; any other path belongs to the node whose `spx/**/tests/` file names it and whose spec links that test, or whose spec or decision names that path in an `[audit]` assertion; several matching nodes resolve to their lowest common ancestor. Product content with no governing spec is not read or modified; record the gap. An operational continuation — PR inspection, check wait, merge, deploy, release, `spx session` operations, occupancy proof — touches no product content and triggers neither `/understand` nor `/contextualize`.

### When creating specs or nodes -> `/author`

Create product decisions (ADRs/PDRs), specs, enabler nodes, outcome nodes.

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

**Codex execution boundary.** Invoke `/wait-for-load` in its own top-level `functions.exec` call. Inside that call, set a nested `exec_command` yield below the outer call's yield window so the nested call returns either terminal JSON or a `session_id` before the outer call can yield. When it returns a `session_id`, preserve that exact id and collect the same waiter with `write_stdin` in later top-level calls whose outer yield window exceeds the nested `write_stdin` yield. Treat readiness as established only when a top-level call visibly returns the terminal JSON with `ready: true`; an internal exit-code branch, a successfully completed outer cell, or an empty terminal payload is insufficient. Start the selected command in a separate top-level `functions.exec` call. **NEVER** place the waiter and selected command in the same `functions.exec` script or use `functions.wait` as the planned collector for a nested waiter or selected command.

**Codex process lifecycle.** Every nested `exec_command` that returns a `session_id` creates an owned process handle. Record it immediately, collect it with `write_stdin` until an `exit_code` is observed, and reconcile every known handle before another process sequence, an operator question, merge or publication, or turn end. If the work is abandoned, interrupt that process and collect its terminal result. Error output or sufficient-looking partial output never closes the handle and never permits leaving its background terminal dangling.

### When shipping work to the default branch -> `/merge` (transport dispatcher)

**BLOCKING REQUIREMENT**

Every change destined for the default branch routes through `/merge`, the transport dispatcher — it classifies the changeset, selects the transport, and delegates. `spx/local/merging.md` is the one place repository-specific merge behavior belongs, and it is optional: when absent, `/merge` applies the default lifecycle rather than blocking. Never infer the transport from other docs, and never edit this generated instruction block to change merge behavior. The four authority gates, the delivered-value boundary, and the finding-disposition rule are transport-neutral and live in `/merging-standards`.

## Stop Triggers

Default-branch work is complete only when it reaches the default branch on origin through `/merge` — passing validation, tests, review, or audits is progress, not a stopping point, and an accepted proposal ("yes", "go", "do it") authorizes the whole lifecycle, not a pause. Each trigger below resolves the same way: finish the remaining independent work, then continue through `/commit-changes` and `/merge` until the change reaches the default branch on origin or an explicit lifecycle gate stops.

🛑 **About to summarize after edits, validation, tests, review, or audits passed** — do not conclude.

🛑 **About to report blocked, wait, or ask a question** — first do every action that does not need the answer: edits, verification, branch setup, commit, review. A blocker exists only when all three hold:

- the immediate next action cannot proceed without the operator or an external-state change;
- the local branch already holds every change makeable without the answer;
- the applicable gates have run or produced concrete failing evidence.

🛑 **About to finish on a detached HEAD or stop at a fresh commit** — `git status --short --branch` reporting `## HEAD (no branch)`, or a new local commit, is not an endpoint; create or switch to a local branch preserving the worktree changes, unless the user explicitly limited the task to local-only work.

## Checkpoint Commits

`/commit-changes` may create an atomic local checkpoint whenever a coherent concern is ready to preserve, independent of verification state — never strand dirty work because verification fails or has not run. Record the latest state as `passing`, `failing`, or `not-run`; that state controls later gate dispatch, never commit permission. Run hooks normally, confirm the full `HEAD` changed, and report committed paths, remaining paths, and verification state.

## Commit Before Another Session Reads

Changes may remain uncommitted while the authoring agent session works on them. When repository writes are authorized, commit the exact current version through `/commit-changes` before another agent session or human reads it for collaboration or reusable verification; the commit may record `passing`, `failing`, or `not-run`. After any further change, commit the new version before another such reading. An explicit advisory audit or review may inspect modified or untracked work, but its verdict is not reusable gate evidence. Without repository-write authorization, defer a reading that requires a committed subject. Agentic gate dispatch additionally requires its declared deterministic verification to pass on the exact committed subject.

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

## Autonomy Boundary

Default-branch git and version-control mutation — branching, committing, pushing, publishing, merging, and the `/merge` flow's own cleanup of the branches it created — proceeds only inside a governing skill flow, never as a direct command outside one; creating or switching to a local branch to preserve work in progress, and a `--force-with-lease` push to the working branch that flow owns, stay inside it. The `/merge` direct-push transport's publication of a coordination-note-only changeset to the default branch on origin, performed under a held `MERGE_READINESS` with a converged local review, is likewise inside its governing flow. This autonomy never extends to force-pushing a shared or protected ref, deleting a ref no active skill flow authorizes, bypassing commit hooks (`--no-verify`) or commit signing, or any action the Git Safety Protocol forbids; each needs explicit operator instruction in the same turn.

### Sub-agent dispatch

The configured verifier and reviewer roles this router names are pre-authorized. A harness rule may require the operator to request sub-agent use before one is dispatched; treat this section as that standing request. Authorization follows the named role, never a role resemblance.

- **NEVER** ask the operator to confirm dispatching one — not at a gate, not per node, not once per session, and never as a structured-question option set. A harness permission prompt is the operator's to answer, never a question to raise.
- **NEVER** dispatch a sub-agent this router does not name merely because it is discovered, available, or plausibly useful.
- **NEVER** run a verification skill — audit or review — in the main conversation; the separate verifier agent session keeps the verdict free of the authoring agent session's bias.
- **ALWAYS** treat the gate as blocked when a named role cannot be dispatched or does not return: finish the deterministic verification, then report the exact dispatch attempted and how it failed.

### Agent identity in generated artifacts

**NEVER** name the agent or its runtime in an operational artifact — a branch name, commit message, pull-request title or body, review comment, or authorship marker written into a product file. Describe the work, never who performed it. Exact filesystem paths, package and tool names, quoted command output, and operator-supplied text keep their required spelling.

**ALWAYS** confine that ban to operational artifacts. Authored guidance that documents Claude's behavior uses imperative voice or names Claude as its subject by design; stripping Claude from that guidance to satisfy this rule misapplies it rather than complying with it.

### Operator questions

Raise an operator question through request_user_input, never as prose the operator has to answer in free text. Reserve it for an answer that changes what happens next and that no loaded skill, decision, spec, or command output settles — a product-intent conflict a rebase cannot decide, a blocked expense ceiling, or a resolution the evidence leaves genuinely open. Name the exact blocked action, what each option does, and a pause-and-inspect choice.

- **ALWAYS** finish every action that does not depend on the answer first, so the question is the only thing outstanding when it is asked.
- **NEVER** raise one to confirm work already authorized, to report progress, or to choose an option the loaded truth already decides.

## Mutation Status Updates

Before proposing or performing a repository mutation, name:

- the exact target path, PR number, branch ref, or command target;
- the intended action;
- why the action is local enough or gate-authorized enough to proceed;
- the next validation command, review, audit, check wait, or merge gate the action feeds.

Avoid shorthand such as "config patch" or "ship it path" when the exact file, PR state, or command is known. A terse prompt such as "check", "continue", or "ship it" still gets the live state first: full head SHA when a PR exists, current-head review state, required-check state, deployment-readiness and release-readiness rules, and the next autonomous action.

## Quick Reference: Skills and Agents

Skills run in the main conversation. Agents preload the skill and run autonomously in their own agent sessions. Audit agents return structured verdicts; changeset reviewer agents return the raw review journal token for the main conversation to inspect and process through the governing review workflow. Dispatch agents in parallel when auditing multiple targets; `### Sub-agent dispatch` above governs when to dispatch one.

**Read each file fully in its designated context.** A file the user names is read in the main conversation. A file this conversation authored is verified by a configured verifier or reviewer in an independent context. Subagents may locate files; a file the main conversation needs is then read in the main conversation in full.

**Dispatch each named role through the runtime's exposed typed-subagent spawn capability** (`multi_agent_v1.spawn_agent` when that identifier is available), spawning the matching subagents in parallel when several roles apply. `### Sub-agent dispatch` above governs when to dispatch, forbids asking the operator to confirm, and blocks the gate when a named role cannot be dispatched; this section governs only the Codex mechanics. Act only on the result the subagent returns.

**Already-dispatched verifier boundary.** Apply the typed-spawn rules above only in the main authoring conversation. Once running as a named verifier or reviewer, treat the current context as the required isolation and execute the configured audit or review skill directly. NEVER search for or spawn another verifier, use `tool_search` to discover multi-agent tools, or invoke `codex exec`, `claude`, `pi`, or another agent CLI. Missing nested-verifier tools is expected inside the dispatched verifier and does not block direct execution.

**STOP TRIGGER — in the main authoring conversation, discover deferred agent tools before reporting an agent unavailable.**

If a named agent or lifecycle tool is absent from the initial list, inspect the runtime's complete deferred-tool registry. Use top-level `functions.exec`; inside it, inspect `ALL_TOOLS`. Treat `exec_command` as the nested shell tool. Check typed `multi_agent_v1.spawn_agent` and its `Available roles`; an exact match proves availability. Report unavailable only when discovery finds no typed spawn capability or omits the exact role, and include that result. Visible catalogs, initial tools, generated rosters, and local `agents/*.md` files are not availability evidence.

**Use the exposed multi-agent tool schema exactly.** The examples below use the `multi_agent_v1` identifiers emitted by this Codex harness. When the runtime exposes different identifiers, discover the equivalent typed spawn, wait, send-input, and close capabilities and preserve the same fields and result contracts. The initial turn goes in `message`; use `items` only when the turn must pass structured mentions. Omit `fork_context`, `model`, `reasoning_effort`, and `service_tier` for the typed verifier and reviewer agents. Full-history forks are incompatible with changing `agent_type` in this harness, and the named verifier/reviewer roles already carry their own model settings. Store every returned agent id verbatim. The role task is the spawn's initial `message`, so one spawn and one wait complete a role. After spawning, continue only non-overlapping work while the subagent runs, then collect the result with the exposed wait capability and close the child immediately. Completed agents remain open until closed and can interfere with future spawns.

### Subagent lifecycle — preserve every handle and close every thread

Treat every spawned subagent as an owned resource. Maintain a registry in the main conversation containing its exact `agent_id`, role or task, and lifecycle state. Record a successful spawn's returned id before issuing another spawn or making any unrelated tool call. Preserve every unresolved registry entry across interruption and compaction.

**Acquire handles sequentially while agents execute concurrently.** Call `multi_agent_v1.spawn_agent` once per tool call. Several sequential spawn calls may occur within one main-agent tool-call sequence before control returns to the operator, and every agent already spawned may run concurrently while later calls are issued. NEVER place multiple spawn calls in `Promise.all`, another fail-fast combinator, or one parallel tool-call batch: one rejected call can suppress successful sibling results and lose their ids even though those agents remain open. Respect the runtime's configured `agents.max_threads` limit; NEVER hard-code a maximum such as eight and NEVER fill capacity with agents that are not required.

Before each spawn sequence, reconcile the registry: preserve any final results already returned, close their agents, and close work that has been abandoned or superseded. If a spawn fails, stop issuing new spawns, retain every id already acquired, and collect or close those known agents before retrying. A failed individual spawn yields no id for that call and does not erase ids returned by earlier calls.

**Collect, preserve, then close.** Use `multi_agent_v1.wait_agent` with only exact ids from the registry. A timeout with no final status is non-final. When the result remains required, wait again; when the work is explicitly abandoned or superseded, close the agent. For every final status, preserve the complete final message, structured verdict, or journal token first, then close the child and mark it closed in the registry. A notification, pending handle, or open id is never a final result.

Reconcile every registry entry at these checkpoints:

- immediately after a final result;
- before another spawn sequence;
- after any spawn failure;
- after interruption or compaction;
- before asking the operator a question;
- before entering a merge or publication phase; and
- before yielding control to the operator or ending the turn.

At a checkpoint, wait again for every still-required result and close every abandoned or superseded agent. Before merge, publication, or response end, every known id must be closed and every required result must already be preserved. Do not leave completed agents open; completed agents continue consuming thread capacity until closed.

NEVER invent, shorten, or substitute an agent id, including an all-zero placeholder. NEVER assume `multi_agent_v1.list_agents` exists; if the runtime exposes a listing tool, use it only to reconcile the registry. The interactive `/agent` picker is operator-side recovery when registry reconstruction is impossible, never a substitute for preserving ids. If `multi_agent_v1.close_agent` returns `not_found`, record that exact result and do not call `multi_agent_v1.resume_agent` merely to close the id. Resume only when intentionally continuing a known closed agent's work.

**Spawn each verifier or reviewer with its role task as the initial turn.** The `agent_type` binds the child to its configured agent definition, so the role task goes directly in the spawn's `message` and no separate turn precedes it:

```json
{
  "tool": "multi_agent_v1.spawn_agent",
  "arguments": {
    "agent_type": "<exact-agent-type>",
    "message": "<role-task>"
  }
}
```

Record the returned agent id verbatim, then collect the role-task result with `multi_agent_v1.wait_agent`. The role task passes only through its own output contract below; an error, timeout, missing final message, or output outside that contract blocks the gate. Record the full agent id and observed result, and close the child.

Wait once for one or more spawned agents. Use the 10-minute individual-file timeout for subagents such as `spec-tree_implementation-auditor` or `spec-tree_spec-auditor`:

```json
{
  "tool": "multi_agent_v1.wait_agent",
  "arguments": {
    "targets": ["<agent-id-from-spawn-agent>"],
    "timeout_ms": 600000
  }
}
```

Use the 30-minute changeset timeout only for `spec-tree_changes-reviewer` role work:

```json
{
  "tool": "multi_agent_v1.wait_agent",
  "arguments": {
    "targets": ["<agent-id-from-spawn-agent>"],
    "timeout_ms": 1800000
  }
}
```

Close a completed or no-longer-needed agent:

```json
{
  "tool": "multi_agent_v1.close_agent",
  "arguments": {
    "target": "<agent-id-from-spawn-agent>"
  }
}
```

In the main authoring conversation, if `multi_agent_v1.spawn_agent`, `multi_agent_v1.wait_agent`, or `multi_agent_v1.close_agent` is not initially exposed, discover it through the runtime's complete deferred-tool registry before concluding the capability or role is unavailable. Accept a subagent notification only when the harness delivers it while the main conversation is working or waiting; do not choose notifications as the planned result-collection mechanism. Do not use web search, time lookup, shell polling, or `request_user_input` or any other tools as a substitute for result collection.

**Result collection for verifier and reviewer agents.** The exposed typed wait capability (`multi_agent_v1.wait_agent` in the examples below) is the planned result-collection mechanism for the role task. Read its returned JSON, keyed by the spawned subagent id under `status`. A timeout returns an empty `status` object and is not a result. A final status for the target id is the turn result; when that final status carries a final message, that message is the turn output. Do not infer success from a subagent notification, a pending handle, or an open subagent id.

Successful `spec-tree_changes-reviewer` result shape:

```json
{
  "status": {
    "<agent-id-from-spawn-agent>": {
      "status": "completed",
      "message": "<raw-spx-review-journal-token>"
    }
  },
  "timed_out": false
}
```

Blocked or incomplete result shape:

```json
{
  "status": {},
  "timed_out": true
}
```

**Codex `spec-tree_changes-reviewer` output contract.** For `agent_type: "spec-tree_changes-reviewer"`, a successful final message is the raw `spx journal --type review` run token. Treat that token as the only review result. Inspect the review by reading or rendering the sealed journal prefix for that token. Do not ask the reviewer to summarize findings, do not accept a prose summary as the gate result, and do not run `spec-tree:review-changes` in the main thread to replace a missing token.

**Codex blocked-result rule.** If `wait_agent` returns an error, `not_found`, timeout with no final status, usage-limit failure, model-capacity failure, or any final message that is not a raw review journal token, the review gate is blocked. Record the exact agent id, tool result, and blocking reason. Do not publish, merge, or mark the gate passed. When repairing a finding or blocked subject, rerun deterministic verification, create a new local checkpoint commit, and review that new head; an operator-approved process exception is the only other path past the gate.

**Use raw scope only for the `spec-tree_changes-reviewer` role task.** The review agent owns `spec-tree:review-changes`, severity taxonomy, scope expansion, and finding shape. Pass only the raw scope token as the spawn `message`: `HEAD` for the current committed branch scope, `origin/<base>...HEAD` for a specific committed range, a branch name, or a PR reference. Confirm the worktree is clean before dispatch; commit the exact current version before the reviewer agent session reads it.

- ALWAYS prepare the worktree first: isolate the intended changes, sync to the base using the `spec-tree:sync-base` skill when the governing workflow requires it, pass deterministic verification, create a local checkpoint commit, and leave the worktree clean so the reviewer judges an exact committed head. Never dispatch the reviewer over a working diff.
- NEVER invoke the `spec-tree:review-changes` skill in the main authoring conversation; the `spec-tree_changes-reviewer` invokes it inside its isolated role workflow.
- NEVER pass a prose prompt, restate review instructions, add severity filters, or tell the reviewer to focus only on new changes, or what to emphasize.

```json
{
  "tool": "multi_agent_v1.spawn_agent",
  "arguments": {
    "agent_type": "spec-tree_changes-reviewer",
    "message": "HEAD"
  }
}
```

```json
{
  "tool": "multi_agent_v1.spawn_agent",
  "arguments": {
    "agent_type": "spec-tree_changes-reviewer",
    "message": "origin/<base>...HEAD"
  }
}
```

**Use explicit prompts for audit-agent role tasks.** The `message` field comes from the `multi_agent_v1.spawn_agent` schema. This instruction block owns the prompt content below for required verifier roles. Keep the prompt narrow: repository path, governed artifact paths, governing node or decision, deterministic verification state when relevant, audit task, and output shape. Do not ask the subagent to edit files.

Use this shape for an implementation audit:

```json
{
  "tool": "multi_agent_v1.spawn_agent",
  "arguments": {
    "agent_type": "spec-tree_implementation-auditor",
    "message": "Repository: <absolute-repository-path>\nScope: <base>..<head> committed changeset scope\nLive file list: <none for reusable gate evidence | full modified and untracked paths for explicit advisory audit>\nGoverning node(s): <full spx/... path(s)>\nDeterministic verification already run: <commands and results, or advisory state>\nRun driver identity: {\"producerKind\":\"agent\",\"agentName\":\"implementation-auditor\",\"agentOwningPluginName\":\"spec-tree\",\"skillName\":\"audit-implementation\",\"skillOwningPluginName\":\"spec-tree\",\"invocationRole\":\"run-driver\"}\nTask: Run the implementation audit through spx verification run. Return the run token and rendered projection; the complete blocked SPX diagnostic with run token or not-started, exact command, payload source, payload key, exit code, and stderr; or the complete pre-run skill-load diagnostic with run token not-started, required skill spec-tree:audit-implementation, and the exact load or availability failure."
  }
}
```

**Codex `spec-tree_implementation-auditor` output contract.** A successful final message carries the raw `spx verification run` token and rendered projection, without a competing prose verdict envelope. Treat the projection's `terminalStatus` as authoritative: `approved` passes the implementation-audit gate and `rejected` requires repair. A command-failure `BLOCKED` result leaves the gate blocked and must carry the run token or `not-started`, exact command, payload source, payload key, exit code, and stderr. A pre-run skill-load `BLOCKED` result also leaves the gate blocked and must carry run token `not-started`, required skill `spec-tree:audit-implementation`, and the exact load or availability failure. A missing token or projection, a terminal status outside that vocabulary, or an incomplete blocked diagnostic also leaves the gate blocked.

**Implementation audit subject.** A gate-eligible implementation audit reads an exact locally committed subject, carries `Live file list: none`, and runs only after applicable deterministic verification passes on that subject. An explicit advisory implementation audit may carry the full modified and untracked path list; its result supplies no reusable gate evidence.

**Full deterministic gate ordering.** When the repository declares a full deterministic bundle, run its declared command only after every applicable prior agentic gate has converged on the same clean committed head — including evidence audits, decision audits with any required language-architecture concerns, implementation audits, skill or subagent audits, and changeset review. Never launch it before agentic verification, from inside an agent, or concurrently with another heavy command. Any later change invalidates the full-gate result and requires the affected agentic checks to converge again before rerunning the full bundle.

Use this shape for test-evidence audits:

```json
{
  "tool": "multi_agent_v1.spawn_agent",
  "arguments": {
    "agent_type": "spec-tree_test-evidence-auditor",
    "message": "Repository: <absolute-repository-path>\nGoverning node: <full spx/... node path>\nSpec assertions: <full assertion text or exact spec file path plus assertion headings>\nTest files: <full paths to test files under the node>\nTask: Audit whether the test evidence proves the listed assertions without weakening the selected verification type or test assertion type. Return only the audit-tests JSON verdict, with schema_version 1, skill audit-tests, overall APPROVED or REJECTED, rows, and metadata. Do not add prose outside the JSON object."
  }
}
```

Use this shape for eval-evidence audits:

```json
{
  "tool": "multi_agent_v1.spawn_agent",
  "arguments": {
    "agent_type": "spec-tree_eval-evidence-auditor",
    "message": "Repository: <absolute-repository-path>\nGoverning node: <full spx/... node path>\nSpec assertions: <full [eval] assertion text or exact spec file path plus assertion headings>\nEval artifacts: <full paths to eval.toml, prompt.md, cases.jsonl, and history.jsonl>\nProducer artifacts: <full paths to the producing skill, agent, classifier, script, or command source>\nTask: Audit whether the eval evidence proves the listed assertions without replacing the real producer with a prompt-only simulation. Return the JSON verdict specified by audit-eval-evidence, with overall PASS, FAIL, or UNKNOWN and row findings for failed evidence properties. Do not add prose outside the JSON object."
  }
}
```

Use this shape for spec-node audits:

```json
{
  "tool": "multi_agent_v1.spawn_agent",
  "arguments": {
    "agent_type": "spec-tree_spec-auditor",
    "message": "Repository: <absolute-repository-path>\nNode: <full spx/... node path>\nTask: Audit the node spec for assertion quality, evidence tags, atemporal voice, decision alignment, and spec-tree structure. Return only the audit-specs JSON verdict, with schema_version 1, skill audit-specs, overall APPROVED or REJECTED, the section-structure, atemporal-voice, and tag-fitness rows, and metadata. Do not add prose outside the JSON object."
  }
}
```

Use this shape for decision audits:

```json
{
  "tool": "multi_agent_v1.spawn_agent",
  "arguments": {
    "agent_type": "spec-tree_adr-auditor",
    "message": "Repository: <absolute-repository-path>\nDecision file: <full spx/.../*.adr.md path>\nGoverning node: <full spx/... node path>\nAudit scope: <exact committed changeset or artifact scope>\nScope classification: <language-neutral | implementation-language partitions: comma-separated languages>\nTask: Audit the ADR for decision structure, atemporal voice, tag validity, and every language-specific architecture concern required by the scope classification. Return only the structured JSON verdict specified by audit-adr, with no prose outside the JSON object."
  }
}
```

```json
{
  "tool": "multi_agent_v1.spawn_agent",
  "arguments": {
    "agent_type": "spec-tree_pdr-auditor",
    "message": "Repository: <absolute-repository-path>\nDecision file: <full spx/.../*.pdr.md path>\nGoverning node: <full spx/... node path>\nTask: Audit the PDR for product-decision structure, atemporal voice, tag validity, downstream alignment, and evidence quality. Return only the audit-pdr JSON verdict, with schema_version 1, skill audit-pdr, overall APPROVED or REJECTED, the content-classification, property-quality, tag-validity, atemporal-voice, and consistency rows, and metadata. Do not add prose outside the JSON object."
  }
}
```

Use this shape for skill audits:

```json
{
  "tool": "multi_agent_v1.spawn_agent",
  "arguments": {
    "agent_type": "instructions_skill-auditor",
    "message": "Repository: <absolute-repository-path>\nSkill content: <full paths to every changed artifact governing the skill surface, including SKILL.md files, skill subdirectory files, authored shared fragments, and generated runtime copies>\nGoverning node(s): <full spx/... path(s) when known>\nDeterministic verification already run: <commands and results, or why this audit is being run before verification>\nTask: Audit the changed skill content for skill-authoring standards, agent-prompt standards, progressive disclosure, portability, voice, and structure; also audit the complete plugin skill-name set when the active repository skill-authoring overlay requires a plugin-wide naming audit. Return only the structured JSON verdict specified by instructions:audit-skill, with no prose outside the JSON object."
  }
}
```

Use this shape for one subagent audit. When several custom-agent configurations changed, dispatch one `instructions_subagent-auditor` per file: acquire each handle sequentially, then let the role tasks run concurrently.

```json
{
  "tool": "multi_agent_v1.spawn_agent",
  "arguments": {
    "agent_type": "instructions_subagent-auditor",
    "message": "Repository: <absolute-repository-path>\nCustom agent file: <full path to one changed agent-directory file in the checkout>\nGoverning node(s): <full spx/... path(s) when known>\nDeterministic verification already run: <commands and results, or why this audit is being run before verification>\nTask: Audit the changed custom agent configuration for subagent-authoring standards, prompt voice, tool boundaries, model settings, skill preloads, and output contract. Return only the structured JSON verdict specified by instructions:audit-subagent, with no prose outside the JSON object."
  }
}
```

**Inspect every successful `spec-tree_changes-reviewer` result through the sealed journal.** Invoke the `spec-tree:project-run-journal` skill and use its `render_review_run.py <run-token>` helper. The helper calls `spx journal render --type review --run <run-token>`, resolves a not-found current-scope miss through `spx journal list --type review --sealed sealed --limit 200`, re-renders with the listed branch slug when exactly one sealed run matches the token, reads the sealed event prefix, and prints the raw token, terminal status, full head/base identity, scope coverage, blocking/debt counts, and any findings through `render_surface(events)`. Treat this as journal inspection; the sealed prefix remains the only review result.

**Configured verifier and reviewer role-task contracts.** Supply only the fields named for the role:

- `spec-tree_changes-reviewer`: the raw scope token — `HEAD`, `origin/<base>...HEAD`, a branch, or a PR reference. Its final message MUST be the raw sealed review-journal run token.
- `spec-tree_implementation-auditor`: repository path, exact committed `<base>..<head>` scope, no live file list for a gating audit, governing node paths, deterministic verification commands and results, the `spec-tree_implementation-auditor` role's six-field run-driver identity, and the task to run the implementation audit through `spx verification run`. Its final message MUST carry the raw run token and rendered projection; only `terminalStatus: approved` passes.
- `spec-tree_test-evidence-auditor`: repository path, governing node, full assertion text or exact spec path plus headings, test-file paths, and the task to audit coupling, falsifiability, alignment, and coverage without weakening the evidence type. Its final message MUST be the `spec-tree:audit-tests` JSON verdict with `schema_version: 1`, `skill: "audit-tests"`, `overall: "APPROVED" | "REJECTED"`, `rows`, and `metadata`, with no prose outside the JSON object. Treat `overall` as authoritative. Malformed JSON, a missing required field, an unexpected `skill`, or an `overall` value outside that vocabulary blocks the gate.
- `spec-tree_eval-evidence-auditor`: repository path, governing node, `[eval]` assertions, all eval artifacts, producer artifacts, and the task to audit real-producer evidence. Its final message MUST be the audit-eval-evidence JSON verdict with overall `PASS`, `FAIL`, or `UNKNOWN` and no prose outside the JSON object.
- `spec-tree_spec-auditor`: repository path, full node path, and the task to audit assertion quality, evidence tags, atemporal voice, decision alignment, and structure. Its final message MUST be the `spec-tree:audit-specs` JSON verdict with `schema_version: 1`, `skill: "audit-specs"`, `overall: "APPROVED" | "REJECTED"`, the `section-structure`, `atemporal-voice`, and `tag-fitness` rows, and `metadata`, with no prose outside the JSON object. Treat `overall` as authoritative. Malformed JSON, a missing required field or row, an unexpected `skill`, or an `overall` value outside that vocabulary blocks the gate.
- `spec-tree_adr-auditor` or `spec-tree_pdr-auditor`: repository path, full decision path, governing node, committed audit scope, and the role's decision-audit task; ADR tasks also carry the language-scope classification. The final message MUST follow that auditor's structured verdict contract without a competing prose envelope.
- `instructions_skill-auditor`, when that configured role is installed: repository path, full paths to every changed artifact governing the skill surface — including skill-directory files, authored shared fragments, and generated runtime copies — governing nodes when known, deterministic verification state, and the skill-authoring audit task. Its final message MUST be the `instructions:audit-skill` JSON verdict with `schema_version: 1`, `skill: "audit-skill"`, `overall: "APPROVED" | "REJECTED"`, and the `keep-these-aspects`, `worth-improving`, and `must-fix` rows. Treat `overall` as authoritative. Malformed JSON, a missing required field or row, an unexpected `skill`, or an `overall` value outside that vocabulary blocks the gate.
- A craft plugin's `{plugin}-auditor` — the artifact-type auditor named for the plugin that governs its artifact type, such as a prose plugin's `prose-auditor` — when that configured role is installed: the artifact content or full paths under audit, every classification the owning plugin's audit skill requires as an input, and the audit task that skill declares — consult that skill for its exact required-field list and for its declared output contract, which is one of two shapes. When it declares a structured verdict, the final message MUST be that verdict with no prose outside it; treat `overall` as authoritative, and a malformed verdict, a missing required field, a verdict that does not identify itself as the owning plugin's audit skill, or an `overall` value outside the declared vocabulary blocks the gate. When it declares a sealed-run journal token, the final message MUST be that raw token with no prose outside it; render the sealed run through `spx journal render --type <the skill's declared run type> --run <run-token>` and treat the run's terminal status as authoritative, with only `approved` passing, and a blocked, unsealed, or unrenderable run blocking the gate. A final message that is neither the declared verdict nor the declared token blocks the gate.

- `instructions_subagent-auditor`, when that configured role is installed: repository path, exactly one changed custom agent configuration path in the active agent harness's native format, governing nodes when known, deterministic verification state, and the subagent-authoring audit task. Multiple changed configurations require separate `instructions_subagent-auditor` dispatches, one per path; acquire their handles sequentially and let the role tasks run concurrently. Each final message MUST be the `instructions:audit-subagent` JSON verdict with `schema_version: 1`, `skill: "audit-subagent"`, `overall: "APPROVED" | "REJECTED"`, and the `critical-issues`, `recommendations`, `strengths`, and `quick-fixes` rows. Treat `overall` as authoritative. Malformed JSON, a missing required field or row, an unexpected `skill`, or an `overall` value outside that vocabulary blocks the gate.

| User Says...                                            | Skill                  | Agent                             |
| ------------------------------------------------------- | ---------------------- | --------------------------------- |
| "Implement this outcome" or "Start the TDD flow"        | `/apply`               | —                                 |
| "Create an outcome" or "Add an ADR"                     | `/author`              | —                                 |
| "Add a new node" or "This node is too big"              | `/decompose`           | —                                 |
| "Move this under that"                                  | `/refactor`            | —                                 |
| "Check these specs"                                     | `/align`               | —                                 |
| "Establish evidence for this" or "Write tests for this" | `/verify`              | —                                 |
| "Audit this PDR"                                        | `/audit-pdr`           | `spec-tree_pdr-auditor`           |
| "Audit this ADR"                                        | `/audit-adr`           | `spec-tree_adr-auditor`           |
| "Audit test evidence"                                   | `/audit-tests`         | `spec-tree_test-evidence-auditor` |
| "Audit eval evidence"                                   | `/audit-eval-evidence` | `spec-tree_eval-evidence-auditor` |
| "Audit this spec node"                                  | `/audit-specs`         | `spec-tree_spec-auditor`          |
| "Diagnose the spx environment"                          | `/diagnose`            | —                                 |
| "File a follow-up in a dependency queue"                | `/issue`               | —                                 |

Per-language code, architecture, and test audits ship as `audit-{lang}-{code|tests|architecture}` skills that generic artifact-type auditors compose for the language in scope. There is no per-language auditor agent. Dispatch `spec-tree_implementation-auditor` for implementation audits; it invokes the matching language concern skills automatically. Any per-language audit-skill table this instruction block carries covers only the languages recorded in its opening `<!-- SPEC-TREE v{version} langs:{list} -->` marker.

| User Says...                | Skill (composed)                 | Composing agent                    |
| --------------------------- | -------------------------------- | ---------------------------------- |
| "Audit this code"           | `/audit-typescript-code`         | `spec-tree_implementation-auditor` |
| "Audit ADRs for TypeScript" | `/audit-typescript-architecture` | `spec-tree_adr-auditor`            |
| "Audit these tests"         | `/audit-typescript-tests`        | `spec-tree_test-evidence-auditor`  |

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

Sessions are shared across every worktree. Hand off each session via `/handoff` so it can be resumed from any other worktree: the handoff leaves the worktree clean and persists all state on origin. Propose one when the session's goal is met or the work must pause; resume with `/pickup`. When a claimed session is complete and should leave the active queue, close it through `/handoff` or `/handoff --no-session` so claimed-session accounting archives it. To return a wrongly claimed session to the shared queue instead, run `spx session release <session-id>`.

An explicit request to inspect, archive, or release identified session documents routes directly through the corresponding `spx session` command as operational-state management; `/handoff` is reserved for closing active work through reflection, persistence, continuation disposition, and claimed-session accounting. Direct session operations require `/understand` only before following their output into `spx/`, source, or test content.

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
- ⚠️ **STOP TRIGGER: about to run `pnpm exec tsc --noEmit`, `npx tsc`, or any bare type-check command** — run `pnpm run typecheck` instead. Bare `tsc` misses product-specific config, paths, and exclusions. This applies to every TypeScript check, not just commit-time.
- ⚠️ **ALWAYS run the documented pnpm validation scripts after code changes** — before audit, before commit, before claiming "done". `pnpm run typecheck` alone is not the quality gate — it runs only TypeScript checking. Run `pnpm run validate` for source validation, plus the relevant tests. Circular dependency detection runs in CI, not as a local gate.
- 🛑 **STOP TRIGGER — running tests. NEVER run the full suite to verify a change; run the touched scope through `spx test`.** `pnpm test` (and `spx test` with no operands) runs ~2100 tests — minutes idle, up to ~20 minutes under machine load, and agents looping it during PR cycles exhaust the host. The product has ONE test verb, `spx test`; pick a **situation**, not a runner:
  - **Verify work in progress** → `spx test --changed [--base origin/main]` — focused by the branch/worktree diff (`spx/41-test.enabler/95-changed-set-planning.enabler`), or `tsx src/cli.ts test --changed [--base origin/main]` when changing `spx test` itself on this branch (the global `spx` runs `main`'s stale build). To force one known node or file, use `spx test spx/<node>` or `spx test spx/<node>/tests/<file>`.
  - **Read status without running** → `spx spec status` (reads recorded evidence; runs nothing).
  - **CI gate / status projection** → `spx test passing` — CI's job (`.github/workflows/deterministic-verification.yml`), not a local routine.
  - **Deliberate full local run (rare)** → `pnpm test`, only with a specific written justification (e.g. a cross-cutting change whose touched scope cannot cover the contract — the escalation `spx/local/merging.md` declares).
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

## Validation Gates

**NEVER commit without passing source validation.**

```bash
# Quick verification before committing
# Source validation for current TypeScript source
pnpm run validate

# plus the focused tests that cover the touched spec node, source module, or workflow

# Build packaged output for the `spx` executable
pnpm run build
```

`pnpm run validate` and related development scripts execute `tsx src/cli.ts`, so they validate the current source tree even when `dist/` exists. The packaged executable `bin/spx.js` requires `dist/cli.js`; invoke it only after `pnpm run build`.

### Verification Checkpoint Checklist

Before creating a local checkpoint commit for agentic verification:

- [ ] **`/apply` context is loaded and the diff is stabilized**: methodology/context loaded and obvious contradictions resolved before dispatching auditors
- [ ] **`pnpm run validate`** passes (source CLI aggregate pipeline, circular skipped)
- [ ] **Focused tests for the touched scope** pass; widen only when `spx/local/merging.md` escalation applies

### Committing Changes

**ALWAYS use the `/commit-changes` skill to commit.** Never run raw git commands for commits.

```bash
# Correct: invoke the skill
/commit-changes

# Wrong: manual git commands
git add . && git commit -m "..."
```

### Available Validation Commands

The pnpm scripts below are the agent-facing workflow interface for local validation:

| pnpm Script                   | Purpose                                        |
| ----------------------------- | ---------------------------------------------- |
| `pnpm run validate`           | Source aggregate validation, circular skipped  |
| `pnpm run validate:published` | Built executable validation, circular skipped  |
| `pnpm run lint`               | ESLint only                                    |
| `pnpm run lint:fix`           | Auto-fix ESLint issues                         |
| `pnpm run typecheck`          | TypeScript only                                |
| `pnpm run circular`           | Source circular dependency detection           |
| `pnpm run circular:published` | Built executable circular dependency detection |
| `pnpm run knip`               | Find unused code                               |

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

- **L2 CLI tests exercise the built `dist/`, not source.** An L2 test that exercises the CLI shells out to `node bin/spx.js` → `dist/cli.js`; an L2 test that exercises a product-specific binary on `PATH` (for example `spx/46-agent.enabler/32-search.enabler/tests/locator.scenario.l2.test.ts` against `rg`) depends on that binary and not on `dist/`, so a failure there is a missing or broken binary, never stale `dist/`. Run `pnpm run build` before trusting a CLI L2 result. The Lefthook `rebuild-dist` hook rebuilds only on the **main** worktree — it prints `rebuild-dist: skipped (non-main checkout)` on feature/linked worktrees — so after editing source or rebasing in a feature worktree, `dist/` is stale. A "failing" L2 test (e.g. an assertion seeing old output) is most often just stale `dist/`; rebuild and re-run before treating it as a real failure.
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
