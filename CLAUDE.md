# AI Agent Context Guide: spx

## Critical Rules

- ⚠️ **NEVER modify ANY file without invoking the required skills first** — If you are about to modify a file that touches specs, testing, code, architecture, or any topic covered by a skill (see `<skill_router>` below), invoke the relevant skill BEFORE modifying. Skills are the authoritative source — not grep results, not existing files, not your training data.
- ⚠️ **NEVER write code without invoking a skill first** - See skill table below
- ⚠️ **ALWAYS invoke `/spec-tree:applying` before implementing any spec-tree work item** - Applying is the orchestration skill for spec-tree TDD. It requires methodology/context loading, language-specific architecture, test, and implementation steps, plus blocking audit gates before the work can be treated as ready.
- ⚠️ **NEVER commit spec-tree implementation or test changes without the applying audit gates** - For TypeScript work, `/spec-tree:applying` requires `/typescript:auditing-typescript-tests` before implementation and `/typescript:auditing-typescript` before claiming readiness. Green tests and `pnpm run validate` are necessary but not sufficient for code/test changes.
- ⚠️ **NEVER write tests in `tests/`** - Write in `spx/.../tests/` (co-located with specs)
- ⚠️ **NEVER manually navigate `spx/` hierarchy** - Use `/contextualizing spx/path/to/node` skill
- ⚠️ **ALWAYS read CLAUDE.md in subdirectories** - When working with files in `spx/`, or any other directory, read that directory's CLAUDE.md FIRST if it exists
- ⚠️ **Skills are ALWAYS authoritative over existing files** - When a skill template prescribes a structure (e.g., Architectural Constraints table), follow the skill — not patterns found in existing spec files. Existing files may contain non-standard sections added before skills existed. Never infer framework conventions from existing files; always read the skill.
- 🛑 **SKILLS DOMINATE. NOTHING BELOW THEM VOTES.** Skills > PDR/ADR > Spec > Test > Code. If a skill's examples are extensionless, imports are extensionless — even if 100% of the existing codebase has `.js` suffixes. Those files are in violation; they do NOT constitute precedent. Existing code is the LOWEST layer of truth and decides NOTHING about convention. Before citing "the existing codebase does X" as justification for anything, STOP. That sentence is never an answer to "why did you write it this way?" — the only valid answers are "the skill says so", "the ADR says so", "the spec says so", or "I was wrong." Grep is a research tool, never an authority.
- ⚠️ **NEVER maintain backward compatibility** - When rewriting a module, replace it entirely. No legacy aliases, no re-exports of old names, no shims. Update all imports across the codebase to use the new API.
- ⚠️ **NEVER reference specs or decisions from code** - No `ADR-21`, `PDR-13`, or similar in Python comments or docstrings. Specs are the source of truth; code should not duplicate or point to them. The `semgrep` rule enforces this.
- ⚠️ **NEVER edit `package.json` for dependency changes** - Use `pnpm add`/`pnpm remove` — they update package.json, lockfile, and venv atomically
- ⚠️ **NEVER use Husky for Git hooks** - Lefthook is the only hook runner for this repo. Do not run `husky`, add `husky`, create `.husky/`, or change `core.hooksPath` for Husky. `prepare` must install Lefthook, and `lefthook.yml` is the hook source of truth.
- ⚠️ **NEVER manually delete untracked files or empty directories** - Git doesn't track empty dirs; `.DS_Store` and `__pycache__` are gitignored artifacts. Use `pnpm run clean` to remove them
- ⚠️ **NEVER copy files when moving** - Use `git mv` to move files. This preserves git history. Never `cp` then delete the original.
- ⚠️ **NEVER use agents to create or modify ANY files** - Agents (subagents, background agents) must ONLY be used for read-only research: searching code, reading files, running read-only commands. ALL file creation, editing, and writing MUST happen in the main conversation context. Agents lack context, create unauthorized files, conflict on shared config, and make unasked-for changes.
- ⚠️ **NEVER `readFileSync` source files in tests** — if you want to read source files from tests you have understood absolutely nothing. Tests verify behavior — see `/spec-tree:testing` and `/typescript:testing-typescript` for methodology.
- ⚠️ **NEVER preserve, override, supersede, or refer to stale specs** — if you want to preserve, override, supersede or refer to no longer valid specs in any way, you have not understood durable map from `/understanding`. Specs declare product truth. When the product changes, the spec is rewritten in place. There is no "superseded by" workflow.
- ⚠️ **A spec file is a pure declaration — its type opening (`PROVIDES … SO THAT … CAN …` or `WE BELIEVE THAT …`) plus `## Assertions` (typed, each carrying a `[test]`/`[eval]`/`[audit]` marker), and NOTHING else.** Never add prose, commentary, evidence-state notes, lifecycle narration ("while Declared", "applying converts this"), or workflow explanation. Atemporal voice: a spec states product truth, never narrates its own state or the process that will fill it. Such notes belong nowhere in the tree — not even in PLAN.md.
- ⚠️ **Numeric indices encode dependency order ONLY — lower = provider, higher = consumer, same = independent.** Never infer a "domain band", "foundation band", or any tier/zone from where existing nodes cluster; among dependency-valid indices the operator chooses. Reading a convention out of the current layout is the grep-is-not-authority violation in another guise.
- ⚠️ **A dependency edge B→A must rest on a recognized ordering-evidence type and be verified from the *consumer's* own spec — never inferred from directory clustering or a provider's `SO THAT X CAN …` prose alone.** The bases `/decomposing` recognizes are provider/consumer service flow, logical prerequisite, **vertical-slice value delivery**, shared substrate, feature extension, and ADR/PDR constraint. Vertical-slice value delivery is first-class and load-bearing: a node depends on whatever its value cannot be delivered without — so release sits below every domain, because no capability reaches users unreleased. A verification-coupling check ("can B be verified WITHOUT A") diagnoses substrate/prerequisite edges but is NOT required of every edge; a vertical-slice edge holds even when B verifies fine in isolation. Reach for `/decomposing` to settle any edge.
- ⚠️ **spx applied to spx is excluded from the dependency graph.** spx running its own domains on its own source (CI, `publish.yml`, `pnpm validate`/`test`) is self-application/dogfooding, not a spec-tree edge — encoding it makes a domain depend on itself through publishing (circular). Distinguish "a domain spx offers" from "spx applied to spx."
- ⚠️ **`[audit]` vs `[test]` is the verification MECHANISM, not a lifecycle marker.** In a spec file's `## Assertions`, a testable assertion carries `[test]` (its co-located test is written via `/applying`), `[eval]` for LLM-driven behavior with a structurally scoreable verdict, or `[audit]` (legacy spelling `[review]`) for judgment constraints no automated test can verify — never an `[audit]` "placeholder" for something testable. PDR and ADR `## Verification` rules instead carry the tag their template prescribes: under `### Testing` the evidence type (`[scenario]`/`[mapping]`/`[conformance]`/`[property]`/`[compliance]`), under `### Eval` `[eval]`, under `### Audit` `[audit]`.
- ⚠️ **NEVER discard or displace uncommitted work with `git checkout -- <path>`, `git restore`, `git reset --hard`, `git clean -f`, or `git stash`** — `git checkout -- <path>`, `git restore`, `git reset --hard`, and `git clean -f` discard uncommitted local changes irrecoverably; `git stash` hides them in the stash stack (recoverable, but it conceals in-progress state from concurrent agents). Hand these off to the user; if you need to discard changes, ask the user to do it.
- ⚠️ **NEVER force-overwrite a shared remote ref with plain `git push --force`** — it unconditionally overwrites history a concurrent agent may have advanced. The PR-branch flows use `git push --force-with-lease` (which refuses when the remote advanced) instead, per the rule below.
- ✅ **The `/spec-tree:opening-pr` and `/spec-tree:managing-pr` flows own their own PR branch's history** — per `/spec-tree:standardizing-merging`, those skills autonomously rebase the current PR branch onto its base (`git rebase origin/<base>`), push the rebased branch with `git push --force-with-lease` (never plain `--force` — `--force-with-lease` refuses when the remote advanced, so it cannot clobber a concurrent push), merge via `gh pr merge --rebase --delete-branch`, and delete a merged PR's branch. These are governed, single-author-branch operations, not the work-discarding operations above.
- ⚠️ **STOP TRIGGER: about to run `pnpm exec tsc --noEmit`, `npx tsc`, or any bare type-check command** — run `spx validation ts` instead. Bare `tsc` misses project-specific config, paths, and exclusions. This applies to every TypeScript check, not just commit-time.
- ⚠️ **ALWAYS run `spx validation all` after code changes** — before audit, before commit, before claiming "done". `spx validation ts` alone is not the quality gate — it runs 1 of 5 checks. Never report a subset of checks as clean.
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

The **spec-tree** plugin (`outcomeeng/plugins/plugins/spec-tree`) is the active system for managing specification trees. Core skills:

<skill_router>

| Skill                        | Purpose                                                                    |
| ---------------------------- | -------------------------------------------------------------------------- |
| `/spec-tree:understanding`   | Load methodology foundation (node types, ordering, assertions)             |
| `/spec-tree:contextualizing` | Load context for a specific node (walks tree to target)                    |
| `/spec-tree:authoring`       | Create specs, ADRs, PDRs, enablers, outcomes                               |
| `/spec-tree:decomposing`     | Break nodes into children with proper ordering                             |
| `/spec-tree:testing`         | Manage spec-test lock file lifecycle                                       |
| `/spec-tree:applying`        | Orchestrate spec-tree implementation and audit gates                       |
| `/spec-tree:refactoring`     | Restructure the spec tree (move, consolidate, extract)                     |
| `/spec-tree:aligning`        | Review for gaps, contradictions, and consistency                           |
| `/spec-tree:opening-pr`      | Open ready PRs once REVIEW_READINESS holds (branch hygiene + local review) |

Additional skills ship with the plugin and are invoked by name: `committing-changes`, `interviewing`, `auditing-tests`, `auditing-product-decisions`, `handoff`, `pickup`, `refocusing`, `bootstrapping`. See `outcomeeng/plugins/plugins/spec-tree/skills/` for the full list.

</skill_router>

### Decision records: the decision-first ADR/PDR template

The authoritative ADR and PDR templates are **decision-first**. The skills own them — `/spec-tree:authoring` (`templates/decisions/decision-name.adr.md` and `decision-name.pdr.md`) and `/typescript:architecting-typescript` for ADRs. Read the skill, never an existing decision file, for the shape.

**ADR** — `# Title`, then the decision stated directly as 1–3 sentences of opening prose, then:

- `## Rationale` — brief; name a rejected alternative only when it sharpens the decision
- `## Invariants` — optional; algebraic properties holding for all governed code
- `## Verification` — ALWAYS/NEVER rules grouped under the subsections that apply, ordered by decreasing enforcement strength: `### Testing` (the evidence type: `[scenario]`/`[mapping]`/`[conformance]`/`[property]`/`[compliance]`), `### Eval` (`[eval]`), `### Audit` (`[audit]`). DI and no-mocking testability constraints are `### Audit` rules.

**PDR** — `# Title`, then the decision stated directly as 1–3 sentences of user-observable behavior, then:

- `## Rationale`
- `## Product properties` — optional; ≤3 observable properties
- `## Verification` — the same subsection scheme as the ADR: `### Testing`, `### Eval`, `### Audit`, ordered by decreasing enforcement strength

**Verification subsection order.** Both record types order the subsections by decreasing enforcement strength — `### Testing` → `### Eval` → `### Audit`. The canonical ADR template currently lists them Audit-first; reordering it to match is an upstream fix tracked in `spx/23-spec-tree.enabler/ISSUES.md`.

**What the decision-first template removes.** No `## Purpose`, no `## Context` (Business impact / Technical constraints), no `## Decision` heading (the decision IS the opening prose), no `## Trade-offs accepted` table, no `## Compliance` block with `### Recognized by` / `### MUST` / `### NEVER`, no `## Status`, no level-assignment tables. Trade-offs and business context fold into the decision statement and Rationale.

**The blanket `[review]` tag is retired.** Each Verification rule carries the tag its subsection prescribes: `[audit]` under `### Audit`, `[eval]` under `### Eval`, the evidence type under `### Testing`. `[review]` is accepted only as the legacy spelling of `[audit]` during migration.

**Legacy verbose decision records are no longer valid.** Any ADR or PDR carrying `## Purpose`, `## Context`, a `## Decision` heading, `## Trade-offs accepted`, a `## Compliance` block, or the PDR-specific `## Product invariants` heading (the template's heading is `## Product properties`) — or blanket `[review]` tags — is in violation of the current template and slated for migration to the decision-first shape. It is NOT precedent: do not copy its structure, and never cite it to justify a new or migrated decision record's shape. When the spec-tree reviewer compares a decision-first file against a still-legacy sibling, the legacy sibling is the file in violation.

---

## Validation and Publish Gates

**NEVER commit without passing source validation. NEVER publish without passing the publish gate.**

```bash
# Source validation for current TypeScript source
pnpm run validate

# Quick verification before committing
pnpm run validate && pnpm test

# Build packaged output for the `spx` executable
pnpm run build

# Publish gate: source validation, build, tests, packaged validation
pnpm run publish:check
```

`pnpm run validate` and related development scripts execute `tsx src/cli.ts`, so they validate the current source tree even when `dist/` exists. The packaged executable `bin/spx.js` requires `dist/cli.js`; invoke it only after `pnpm run build`.

### Pre-Commit Checklist

Before committing ANY changes:

- [ ] **`/spec-tree:applying` gates passed for spec-tree code/test work**: methodology/context loaded, architecture audit approved when applicable, test audit approved, code audit approved
- [ ] **`/typescript:auditing-typescript-tests` passed for TypeScript test changes** before committing test-bearing work
- [ ] **`/typescript:auditing-typescript` passed for TypeScript implementation changes** before committing code-bearing work
- [ ] **`pnpm run validate`** passes (source CLI full pipeline)
- [ ] **`pnpm test`** shows 0 failed tests

### Pre-Push Checklist

Before pushing (enforced by lefthook pre-push hook):

- [ ] **`pnpm run build`** succeeds
- [ ] **`pnpm run validate`** passes
- [ ] **`pnpm test`** passes

### Pre-Publish Checklist

Before publishing or tagging a release:

- [ ] **`pnpm run publish:check`** passes
- [ ] **`pnpm run validate:published`** passes after the final build
- [ ] The version in `package.json` matches the release tag

### Committing Changes

**ALWAYS use the `/spec-tree:committing-changes` skill to commit.** Never run raw git commands for commits.

```bash
# Correct: invoke the skill
/spec-tree:committing-changes

# Wrong: manual git commands
git add . && git commit -m "..."
```

### Available Validation Commands

All validation runs through `spx validation` subcommands. Use pnpm scripts or call spx directly:

| pnpm Script                    | Executable path                                      | Purpose                         |
| ------------------------------ | ---------------------------------------------------- | ------------------------------- |
| `pnpm run validate`            | `tsx src/cli.ts validation all`                      | Source full validation pipeline |
| `pnpm run validate:production` | `tsx src/cli.ts validation all --scope production`   | Source production scope only    |
| `pnpm run validate:published`  | `node bin/spx.js validation all --scope production`  | Built executable validation     |
| `pnpm run publish:check`       | source validation -> build -> tests -> packaged gate | Required pre-publish gate       |
| `pnpm run lint`                | `tsx src/cli.ts validation lint`                     | ESLint only                     |
| `pnpm run lint:fix`            | `tsx src/cli.ts validation lint --fix`               | Auto-fix ESLint issues          |
| `pnpm run typecheck`           | `tsx src/cli.ts validation typescript`               | TypeScript only                 |
| `pnpm run circular`            | `tsx src/cli.ts validation circular`                 | Check circular dependencies     |
| `pnpm run knip`                | `tsx src/cli.ts validation knip`                     | Find unused code                |

**Options available on all spx validation subcommands:**

- `--scope <scope>`: Validation scope (`full` or `production`)
- `--files <paths...>`: Specific files/directories to validate
- `--quiet`: Suppress progress output
- `--json`: Output results as JSON

**Scoping literal findings to a subtree:**

`pnpm run validate` runs all 5 checks and floods output when there are many literal findings. To see only the files with problems in a specific subtree:

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

Run the right local gate before publishing. Use `spx validation markdown` for markdown-only spec or instruction changes. Use `spx validation all` for everything else. Add targeted tests for the node or workflow changed, and name those commands in the PR body.

### PR review guidance

`/spec-tree:managing-pr` is the active PR-loop workflow for PR reviews. Automated and human reviewers classify findings by required receiver action using only `BLOCKING`, `DEBT`, and `FOLLOW-UP`.

`BLOCKING` and `DEBT` enter the active PR loop and must be fixed in the same PR. `FOLLOW-UP` items must name the owning tracking location when retention is useful.

Treat PR-level comments as authoritative review surfaces. This product rarely receives inline review-thread comments, and many PRs receive none. A reviewer comment posted in the PR conversation with `BLOCKING`, `DEBT`, or `FOLLOW-UP` findings is a review for the managing-PR gate even when the formal review list and inline review-thread list are empty. Still inspect all three surfaces on every PR pass:

- Formal reviews and PR-level comments via `gh pr view <pr-number> --json reviews,comments`
- Inline review-thread comments via `gh api repos/{organization}/{repo}/pulls/<pr-number>/comments --paginate`
- Check results via `gh pr checks <pr-number>` and the PR `statusCheckRollup`

### Executing PR workflow

Open PRs ready once `REVIEW_READINESS` holds — `/spec-tree:opening-pr` runs the project's deterministic verification and the `changes-reviewer` agent, then creates the PR `ready_for_review` (no draft phase; a stacked PR held draft until its base merges is the one exception). Then let `/spec-tree:managing-pr` drive the merge loop: inspect all review surfaces, classify findings, sync to base when needed, fix `BLOCKING` and `DEBT`, record accepted `FOLLOW-UP`, rerun the local closure gate before pushing, refresh the heartbeat, and evaluate the merge authority gates.

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

Do not wait through shell polling, `sleep`, `gh pr checks --watch`, or workflow-run watchers. When checks or reviews need time, create or refresh the one heartbeat for the PR and re-enter `/spec-tree:managing-pr` on the next fire.

### Ask for adversarial PR audit

Ask the PR reviewers for adversarial auditing of all architecture, security-sensitive workflows, deployment and publishing paths, and any PR that changes production behavior. When checks or reviews need time, create or refresh the heartbeat for the PR and re-enter `/spec-tree:managing-pr` on the next fire. Continue with non-blocking local work while the heartbeat owns the wait.

### Treat PR review findings by receiver action

- Fix `BLOCKING` findings in the same PR, rerun the focused tests and `spx validation all`, then update the PR.
- Fix `DEBT` findings in the same PR, rerun the focused tests and `spx validation all`, then update the PR.
- Record retained `FOLLOW-UP` findings in the owning spec tree node's `ISSUES.md` or `PLAN.md` with evidence, impact, and resolution and Markdown links to all involved files and specs.
- Findings that expose weak evidence require a test rearchitecture using the `/typescript:testing-typescript` skill before merge.

### Merge discipline

- Merge stacked PRs in dependency order.
- Do not deploy or publish from unmerged PR branches.
- Use selective staging and one commit per concern before pushing using the `/spec-tree:committing-changes` skill.
- After merge, sync local `main` and verify the worktree is clean before starting the next branch.

---

## Project Overview

**spx** is a developer CLI for code validation and session management:

- **Code validation** — ESLint, TypeScript, circular dependency detection, unused code analysis
- **Session management** — work handoffs between agent contexts with priority ordering
- **Multiple output formats** — Text, JSON for CI and automation

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
- **`tsx src/cli.ts …`** (and the `pnpm run` wrappers that call it — `pnpm run validate`, `pnpm test`, `pnpm run lint`, …) runs the **current worktree's live source**, no build step. It always reflects exactly what you are editing.
- **`node bin/spx.js …`** (`pnpm run validate:published`) runs the current worktree's built `dist/` — the packaged-artifact gate; requires `pnpm run build` first.

Choose by what the command's result depends on:

| Task                                                                      | Invoke                                                                                                     |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Validate / test / lint / typecheck / `spec status` of work in progress    | `pnpm run <script>` or `tsx src/cli.ts …` — current source; a global `spx` would test `main`'s stale build |
| Any command whose behavior you are changing on this branch                | `tsx src/cli.ts …` — exercise the live code, never a build                                                 |
| Stable operational commands — `session handoff`/`list`/`pickup`/`archive` | `spx …` on `PATH` — canonical; `.spx/` state resolves to the shared common-dir from any worktree CWD       |
| Validate the published executable (release gate)                          | `pnpm run build`, then `pnpm run validate:published`                                                       |
| In doubt                                                                  | `tsx src/cli.ts …` — always correct (live source)                                                          |

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

## Architecture

```
src/
├── agent/         # Agent SDK boundary (injected AgentRunner for agent-authored artifacts)
├── commands/      # CLI command implementations
│   ├── claude/      # spx claude subcommands (deprecated)
│   ├── session/     # spx session subcommands
│   ├── spec/        # spx spec subcommands (deprecated)
│   └── validation/  # spx validation subcommands
├── interfaces/
│   └── cli/         # Commander registration descriptors and CLI boundary primitives
├── domains/       # Domain logic
│   ├── agent-environment/
│   ├── audit/
│   ├── config/
│   ├── release/         # Release data and agent-authored release notes
│   ├── session/
│   ├── spec/        # (deprecated)
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
