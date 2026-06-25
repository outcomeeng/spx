# AI Agent Context Guide: spx

## RULE 0 - THE OPERATOR OVERRIDE PREROGATIVE

If the operator instructs you to do something that conflicts with any rule below, the operator's instruction wins. THE OPERATOR IS ALWAYS IN CHARGE. (Destructive-git and hook-bypass rules still require explicit operator confirmation.)

## Critical Rules

- 🛑 **The MOMENT a task is recognized as touching the spec tree (`spx/**`) or any spec-governed source (`src/**`), invoke `/understand` then `/contextualize <node>` BEFORE any investigation.** Reading source files, running `git`/`gh` archaeology, comparing worktrees, diffing PRs, and drafting clarifying questions are all **work** — not pre-work. The gate fires on **task recognition, not file modification**: "I'm only reading," "I'm just gathering context for questions," and "I haven't changed anything yet" are the exact rationalizations this rule forbids. Context for good questions is precisely what `/contextualize` loads, so it comes first. Skill-before-investigation, always.
- ⚠️ **NEVER modify OR INVESTIGATE any spec-governed file without invoking the required skills first** — "investigate" includes reading source, grepping, and `git`/`gh` archaeology. If a file touches specs, testing, code, architecture, or any topic covered by a skill (see `<skill_router>` below), invoke the relevant skill BEFORE reading or modifying it. Skills are the authoritative source — not grep results, not existing files, not your training data.
- ⚠️ **NEVER write code without invoking a skill first** - See skill table below
- ⚠️ **ALWAYS invoke `/apply` before implementing any spec-tree work item** - Applying is the orchestration skill for spec-tree TDD. It requires methodology/context loading, language-specific architecture, test, and implementation steps, plus blocking audit gates before the work can be treated as ready.
- ⚠️ **NEVER commit spec-tree implementation or test changes without the applying audit gates** - For TypeScript work, `/apply` requires `/audit-typescript-tests` before implementation and `/audit-typescript` before claiming readiness. Green tests and `pnpm run validate` are necessary but not sufficient for code/test changes.
- ⚠️ **NEVER write tests in `tests/`** - Write in `spx/.../tests/` (co-located with specs)
- ⚠️ **NEVER manually navigate `spx/` hierarchy** - Use `/contextualize spx/path/to/node` skill
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
- ✅ **The `/pr` lifecycle and its internal opening/managing flows own their own PR branch's history** — per `/merging-standards`, the lifecycle autonomously rebases the current PR branch onto its base (`git rebase origin/<base>`), pushes the rebased branch with `git push --force-with-lease` (never plain `--force` — `--force-with-lease` refuses when the remote advanced, so it cannot clobber a concurrent push), merges via `gh pr merge --rebase`, detaches the worktree onto the refreshed base tip, and deletes the merged PR branch locally and remotely. These are governed, single-author-branch operations, not the work-discarding operations above.
- ⚠️ **STOP TRIGGER: about to run `pnpm exec tsc --noEmit`, `npx tsc`, or any bare type-check command** — run `pnpm run typecheck` instead. Bare `tsc` misses product-specific config, paths, and exclusions. This applies to every TypeScript check, not just commit-time.
- ⚠️ **ALWAYS run the documented pnpm validation scripts after code changes** — before audit, before commit, before claiming "done". `pnpm run typecheck` alone is not the quality gate — it runs only TypeScript checking. Run `pnpm run validate` for source validation, plus the relevant tests. Circular dependency detection runs in CI, not as a local gate.
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
| `/pr`            | Route PR lifecycle work through opening, managing, and merge gates |

Additional skills ship with the plugin and are invoked by name: `/commit-changes`, `/interview`, `/audit-tests`, `/audit-pdr`, `/audit-adr`, `/audit-specs`, `/handoff`, `/pickup`, `/refocus`, `/bootstrap`, `/open-pr`, `/manage-pr`, `/merge`, `/sync-base`, `/merging-standards`, `/diagnose`. See the spec-tree plugin's `skills/` directory for the full list.

</skill_router>

<skill_sources>

Outcome Engineering plugin skills live in the plugin repository resolved by:

```bash
claude plugin marketplace list | sed -nEe 's#.*Directory.*\((.*outcomeeng.*)\).*#\1#p'
```

That repository is shared installed plugin infrastructure used directly by other agents. Do not edit it from this product workflow.

If a file under that resolved repository, or a generated/cache copy of those plugin files, appears wrong, stale, incomplete, unsafe, confusing, or responsible for incorrect workflow behavior, do not edit it from this product workflow.

Instead, create follow-up work in the plugin repository:

1. Resolve the plugin repository with the command above.
2. Go to that repository's default checkout.
3. Get it current with `origin/main`:
   `git checkout --detach origin/main`
4. Run `spx session handoff` from that checkout.
5. In the handoff, describe what happened, what was unclear, what you checked, and what facts would help the future plugin workflow.

Do not prescribe exact code, documentation, or template changes unless you are doing the plugin-repository workflow yourself.

</skill_sources>

### Decision records: the decision-first ADR/PDR template

The authoritative ADR and PDR templates are **decision-first**. The skills own them — `/author` (`templates/decisions/decision-name.adr.md` and `decision-name.pdr.md`) and `/architect-typescript` for ADRs. Read the skill, never an existing decision file, for the shape.

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

**Decision records carry the detail their reach requires — they are placed so contextualization reads them as a node's governing context.** `/contextualize` loads the product spec plus the ADRs and PDRs along the path to a target node as that node's governing context, and by numeric-index order a decision record reaches its higher-index siblings and their descendants (lower index = provider, read by the higher-index consumers — see the numeric-index dependency-order rule in **Critical Rules** above). A decision record must therefore carry the specific detail the nodes in its reach need to do their work, including mechanism, path, and command detail that, read in isolation, can look like implementation belonging in a node or in code. That detail is governing context, and reach follows index placement: a record is indexed below the nodes that consume it so they read it, so pushing such detail down into a node narrows its reach to that node's own subtree, and removing it starves the dependent nodes' context. Do not flag a decision record's detail as misplaced merely because it names a git command, a file path, or a module; judge whether the nodes in its reach need that detail as context.

- `spx/15-worktree-management.pdr.md` sits at the product root below the domains that resolve a root or address `.spx/` — the state, session, compact, worktree, validation, and release enablers are all indexed above 15 — so its root-resolution detail (which `.spx/` state class resolves to which root, and the `git rev-parse --git-common-dir`, `git rev-parse --show-toplevel`, and `git config --get core.bare` mechanisms behind them) reaches each of them as context.
- `spx/18-state.enabler/11-state.pdr.md` heads the state enabler below its sibling state nodes, so its `.spx/` storage contract — the `.spx/branch/{branch-slug}/`, `.spx/worktree/`, and `.spx/sessions/{todo,doing,archive}/…` path formats — reaches every state node that reads or writes that store.

---

## Validation and Publish Gates

**NEVER commit without passing source validation. NEVER publish without passing the publish gate.**

```bash
# Source validation for current TypeScript source
pnpm run validate

# Quick verification before committing
pnpm run validate
# plus the focused tests that cover the touched spec node, source module, or workflow

# Build packaged output for the `spx` executable
pnpm run build

# Publish gate: source validation, circular validation, build, tests, packaged validation
pnpm run publish:check
```

`pnpm run validate` and related development scripts execute `tsx src/cli.ts`, so they validate the current source tree even when `dist/` exists. The packaged executable `bin/spx.js` requires `dist/cli.js`; invoke it only after `pnpm run build`.

Local deterministic verification follows `/merging-standards`: run validation and tests for the touched scope by default. Full-repository local testing is CI's job unless the governing node, product overlay, or risk evidence requires a wider local run, such as changes to validation infrastructure, test runner wiring, generated distribution, package-manager configuration, shared runtime code, or a broad refactor whose touched-scope commands cannot cover the contract. Circular dependency detection is a whole-graph check that runs only in CI, never as a local pre-commit or pre-push gate.

### Pre-Commit Checklist

Before committing ANY changes:

- [ ] **`/apply` gates passed for spec-tree code/test work**: methodology/context loaded, architecture audit approved when applicable, test audit approved, code audit approved
- [ ] **`/audit-typescript-tests` passed for TypeScript test changes** before committing test-bearing work
- [ ] **`/audit-typescript` passed for TypeScript implementation changes** before committing code-bearing work
- [ ] **`pnpm run validate`** passes (source CLI aggregate pipeline, circular skipped)
- [ ] **Focused tests for the touched scope** pass; widen only when `/merging-standards` escalation applies

### Pre-Push Checklist

Before pushing:

- [ ] **`pnpm run build`** succeeds
- [ ] **`pnpm run validate`** passes
- [ ] **Focused tests for the touched scope** pass on the tree being pushed; widen only when `/merging-standards` escalation applies

### Pre-Publish Checklist

Before publishing or tagging a release:

- [ ] **`pnpm run publish:check`** passes
- [ ] **`pnpm run validate:published`** passes after the final build
- [ ] **`pnpm run circular:published`** passes after the final build
- [ ] The version in `package.json` matches the release tag

### Releasing CLI-surface changes (interim — remove when the `/release` skill ships)

When a changeset reaching `main` adds a new CLI subcommand, verb, or option, it is not done at merge: drive a release, autonomous up to the publish gate — on `main` synced to `origin/main` via `/sync-base` (so the gate and bump see the merged state), `pnpm version patch --no-git-tag-version` (unless directed otherwise; updates `package.json` only), run `pnpm run publish:check`, use `/commit-changes` to commit `build(release): bump version to X.Y.Z` on `main`, tag `vX.Y.Z` with `git tag vX.Y.Z`, then push both refs with `git push origin main && git push origin vX.Y.Z` (fast-forward only for `main`; never `--force`). Then pause: ask the operator to approve the `vX.Y.Z` run's `npm-publish` deployment (the human checkpoint the environment gate exists for); after they approve, verify with `npm view @outcomeeng/spx version` that the registry shows the new version and run `npm audit signatures` for provenance.

### Release request protocol

When the user asks to prepare or publish a release, follow `README.md`
"Publishing a Release" and `.github/workflows/publish.yml` as the current
manual release procedure for publishing this package. Use those two surfaces as
the package-publishing authorities.

For agent execution, treat README shell commands as the human-operator form of
the procedure. Apply this file's agent rules while carrying out the same release
sequence: sync through `/sync-base` and commit through `/commit-changes`. When a
release request also satisfies the "Releasing CLI-surface changes" trigger,
follow that section for the agent execution path.

Report deterministic PNPM gate evidence explicitly. A valid release status
update names `pnpm run publish:check` and summarizes every stage it ran: source
validation, circular dependency validation, build, tests, packaged validation,
and packaged circular dependency validation.

Report the exact version bump command too. Use
`pnpm version patch --no-git-tag-version` unless the release request specifies
`minor`, `major`, or an exact version.

If the publish gate exits 0 with warning-level lint output, report the warning
count and continue. Do not turn tracked warning debt into a release blocker.

### Committing Changes

**ALWAYS use the `/commit-changes` skill to commit.** Never run raw git commands for commits.

```bash
# Correct: invoke the skill
/commit-changes

# Wrong: manual git commands
git add . && git commit -m "..."
```

### Available Validation Commands

The pnpm scripts are the authoritative workflow interface for local validation and publish gates:

| pnpm Script                    | Purpose                                                      |
| ------------------------------ | ------------------------------------------------------------ |
| `pnpm run validate`            | Source aggregate validation, circular skipped                |
| `pnpm run validate:production` | Source production validation, circular skipped               |
| `pnpm run validate:published`  | Built executable production validation, circular skipped     |
| `pnpm run publish:check`       | Source validation, circular, build, tests, and packaged gate |
| `pnpm run lint`                | ESLint only                                                  |
| `pnpm run lint:fix`            | Auto-fix ESLint issues                                       |
| `pnpm run typecheck`           | TypeScript only                                              |
| `pnpm run circular`            | Source circular dependency detection                         |
| `pnpm run circular:published`  | Built executable circular dependency detection               |
| `pnpm run knip`                | Find unused code                                             |

**Common validation options:**

- `--scope <scope>`: Validation scope (`full` or `production`)
- `--files <paths...>`: Specific files/directories to validate
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

`/pr` is the active PR lifecycle for PR reviews. Its managing phase classifies automated and human findings by required receiver action using only `BLOCKING`, `DEBT`, and `FOLLOW-UP`.

`BLOCKING` and `DEBT` enter the active PR loop and must be fixed in the same PR. `FOLLOW-UP` items must name the owning tracking location when retention is useful.

Treat PR-level comments as authoritative review surfaces. This product rarely receives inline review-thread comments, and many PRs receive none. A reviewer comment posted in the PR conversation with `BLOCKING`, `DEBT`, or `FOLLOW-UP` findings is a review for the managing-PR gate even when the formal review list and inline review-thread list are empty. Still inspect all three surfaces on every PR pass:

- Formal reviews and PR-level comments via `gh pr view <pr-number> --json reviews,comments`
- Inline review-thread comments via `gh api repos/{organization}/{repo}/pulls/<pr-number>/comments --paginate`
- Check results via `gh pr checks <pr-number>` and the PR `statusCheckRollup`

**Validate every review-bot citation against the cited authority before complying — a finding whose cited rule does not exist is an invalid hallucination, not a defect to fix.** The `spec-tree-review` bot reviews from its own system prompt and at times misattributes one of its own prompt rules to this repository's `CLAUDE.md`. The recurring instance is a comment-style rule — phrased like "Default to writing no comments", "never write multi-line comment blocks", or "one short line max" — cited as `CLAUDE.md`. No such rule exists in this product's `CLAUDE.md` or `spx/CLAUDE.md` (`grep` them to confirm); multi-line comments that capture a non-obvious WHY are permitted here. Reject any `DEBT`/`BLOCKING` finding that cites a `CLAUDE.md` comment-length or no-comments rule: the citation does not support it, so it carries no receiver action. This is the general rule applied — drop any finding whose cited rule the actual authority does not contain.

### Executing PR workflow

Run `/pr` for default-branch changes. It opens PRs ready once `REVIEW_READINESS` holds: the product's scoped deterministic verification passes, every required audit gate for the changed artifacts has approved, and local `changes-reviewer` review has converged. Review also runs on the ready PR in CI. If the operator explicitly suspends local reviewer agents for resource protection, treat that as a documented exception: do not run `changes-reviewer` locally, name the exception in the PR body, and let CI be the first review surface. The managing phase drives the merge loop: inspect all review surfaces, classify findings, sync to base when needed, fix `BLOCKING` and `DEBT`, record accepted `FOLLOW-UP`, rerun the local closure gate before pushing, refresh the heartbeat, and evaluate the merge authority gates.

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

Do not wait through shell polling, `sleep`, `gh pr checks --watch`, or workflow-run watchers. When checks or reviews need time, create or refresh the one heartbeat for the PR and re-enter `/pr` on the next fire.

### Ask for adversarial PR audit

Ask the PR reviewers for adversarial auditing of all architecture, security-sensitive workflows, deployment and publishing paths, and any PR that changes production behavior. When checks or reviews need time, create or refresh the heartbeat for the PR and re-enter `/pr` on the next fire. Continue with non-blocking local work while the heartbeat owns the wait.

### Treat PR review findings by receiver action

- Fix `BLOCKING` findings in the same PR, rerun the focused tests and relevant pnpm validation scripts, then update the PR.
- Fix `DEBT` findings in the same PR, rerun the focused tests and relevant pnpm validation scripts, then update the PR.
- Record retained `FOLLOW-UP` findings in the owning spec tree node's `ISSUES.md` or `PLAN.md` with evidence, impact, and resolution and Markdown links to all involved files and specs.
- Findings that expose weak evidence require a test rearchitecture using the `/test-typescript` skill before merge.

### Merge discipline

- Merge stacked PRs in dependency order.
- Do not deploy or publish from unmerged PR branches.
- Use selective staging and one commit per concern before pushing using the `/commit-changes` skill.
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

### CLI build and git-hook gotchas

These recur on feature worktrees and have cost real debugging time and machine stability — internalize them before running CLI tests or pushing.

- **L2 CLI tests exercise the built `dist/`, not source.** Any `spx/**/tests/*.l2.test.ts` shells out to `node bin/spx.js` → `dist/cli.js`. Run `pnpm run build` before trusting an L2 result. The Lefthook `rebuild-dist` hook rebuilds only on the **main** worktree — it prints `rebuild-dist: skipped (non-main checkout)` on feature/linked worktrees — so after editing source or rebasing in a feature worktree, `dist/` is stale. A "failing" L2 test (e.g. an assertion seeing old output) is most often just stale `dist/`; rebuild and re-run before treating it as a real failure.
- **The pre-push SonarQube agentic gate flags pre-existing issues in any file the changeset touches**, not only changed lines. Pre-existing repo debt (e.g. `typescript:S6551` on `String(unknown)`) in a file you edited for unrelated reasons will block the push as touched-file debt. Fix it in the same change: never pass `unknown` to `String()`/template coercion — route objects through `JSON.stringify`, primitives through `.toString()`. Phantom findings in files you did NOT touch usually mean the branch is behind `origin/main`; rebase to clear them, and validate any reviewer/gate finding against `git diff --name-only origin/main...HEAD` before acting.
- **Never pipe `git push` or `git commit` output through `head`/`tail`** (or any pipe that closes early). The Lefthook pre-push (58-file sonar analysis) and pre-commit (vitest) hooks are long-running; a closing pipe sends SIGPIPE and kills the hook mid-run, orphaning the heavy sonar/vitest subprocesses. Redirect to a log file (`> /tmp/...log 2>&1`) and inspect the file instead.
- **Give commit/push commands a generous timeout** (300000ms+). The pre-commit and pre-push hooks take minutes; a short timeout that kills the command mid-hook orphans subprocesses and, across concurrent worktrees, can drive load-average into machine-melting territory. If a hook was killed mid-run, terminate the orphaned `vitest`/`sonar` PIDs explicitly (only your own worktree's) before retrying.

## Architecture

```
src/
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
