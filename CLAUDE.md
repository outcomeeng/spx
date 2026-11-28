# Agent guide

Before any other step, pull the methodology checkout `/Users/shz/Code/outcomeeng/methodology/methodology/` and read the parts in `versions/<version>/parts/` your work needs: `product-tree.md` before you read or change a file under `spx/`, `change.md` before you record, refine, apply, audit or close a Change, and `positions.md` when you hold a Position or oversee one. `<version>` is the major and minor of `methodology.version` in `spx.config.yaml`, or, with no `spx.config.yaml`, the version your Product's part names. Methodology governs all work here, except where this guide departs from it. Each departure is deliberate: no one reports it as a finding, files it in an `ISSUES.md`, or records a Change for it. Where a skill and methodology differ, methodology holds.

## Authority

Operator > this guide > methodology > Decision Records > specs > verification > implementation. Never weaken a higher layer to match a lower one; fix the lower layer. Code names no Product Tree spec or decision in a comment or docstring.

## Stop and safety rules

- **Operator question.** When the Operator asks a question, stop every running process that modifies files, external resources or state, and answer at once. Never stop a running verification unless the Operator says so.
- **Dangerous-command guard.** A guard block on one operation, a pipe, a subshell or a background job ends that command. A block on a command whose parts are joined only by `;`, a newline, `&&` alone or `||` alone allows one rerun, part by part in its order, each with literal strings. Never reword or substitute a command, or drop a flagged clause, to get past the guard. Where no sanctioned operation reaches the goal, report the block and its reason to the Operator, and stop. Never pass a dynamic branch name to `git branch -d` or `-D`; type each name literally.
- **Payloads through files.** Multi-line text, or text with a code span, quote, shell metacharacter or JSON, reaches a command only through a file written with the file-write tool into the harness's scratch directory and passed by the tool's file argument. Never through a heredoc, a pipe, or an inline argument.
- **No file removal.** Never run `rm`, `rmdir`, `unlink` or any command that deletes a file. A file a task needs gone goes to the Trash with `trash`. A removal that Git cleanup in a governing skill flow, a skill's bundled script, or a command this guide or a Product's part names performs stays outside this rule.
- **No discarding or hiding work.** Never run `git checkout -- <path>`, `git restore`, `git reset --hard`, `git clean -f` or `git stash` on uncommitted work; a discard goes to the Operator. Never `git reset` onto `origin/<base>`; the base comes in through `/sync-base`.
- **Worktree occupancy.** Before you treat a worktree as free, run `spx worktree status` and require a live claim for that exact worktree root and the current session. A clean tree, a detached HEAD, a branch name or a pane title never proves a worktree free.
- **Autonomy boundary.** Branching, committing, pushing and merging run only inside a governing skill flow. Never force-push a shared or protected ref, delete a ref no skill flow authorizes, bypass commit hooks (`--no-verify`) or bypass commit signing without the Operator's instruction in the same turn.
- **Host lock.** Run every test suite, eval, full gate, compiling build or install verification as `spx orchestration lock [--run-id <id>] -- <command>` (`/wait-for-load`).
- **Merge.** Every change to the default branch goes through `/merge`, unless your Product's part names its own merge path. Work is done only when it is merged into the default branch on origin. Passing checks, a review, an audit, a fresh commit or a detached HEAD is progress, not a stopping point.
- **Commit before another reads.** Commit the exact current version through `/commit-changes` before another session or a person reads it for collaboration or verification.
- **No agent identity** in a branch name, commit message, pull request, review comment or authorship marker in a product file. Guidance that documents an agent's behavior may name the agent.
- **Stop** only to hand off, to answer the Operator's question, or for an answer you cannot settle yourself. Before you ask or report blocked, finish every action that needs no answer.

## Skills

Use only `hold-position`, `product-tree:author-change`, `product-tree:manage-change`, `product-tree:merge`, the steps they invoke (`change-standards`, `interview`, `commit-changes`, `sync-base`, `merging-standards`, `manage-github-pr`, `open-pr`, `manage-pr`), `product-tree:wait-for-load`, and `orca-cli` for the panes of overseen Positions. Every other skill does not work for methodology 4.0. A Change that brings a skill to 4.0 ends part of the hand work that replaces it, so judge its cost of delay by the hand work it ends. Load product context through methodology's Queries (`product-tree/context.md`); never invoke `product-tree:understand` or `product-tree:contextualize`.

## Verification

- You write every artifact and every repair yourself, and launch no subagent.
- Your Product's Advisor is the Auditor and Reviewer of every Audit and Review, in its own session, by mail. It judges against methodology, uses no audit or review skill, and seals each verdict with the four `spx verification run` commands that `spx/local/verification-runs.md` of the methodology checkout states, then returns the run token.
- Pass the Advisor's token where a skill would launch a Verifier. Where a skill launches one and takes no token, launch none, and go on only once the Advisor's run is sealed `approved` with no finding. The Advisor reviews every Changeset; where the repository runs a CI review, merge waits for both.
- Fix each valid blocking finding. After two rejections of one Audit or Review, mail your overseer both and continue as the answer states.
- Run no eval. Wherever a Node records eval evidence, or a row's verification type is Evaluate, the Advisor audits that row in place of the run. A claim a Decision Record gives eval evidence stands on that audit, and no one reports a missing eval run as a finding.
- Where your Product's part states that no Node is Passing, and methodology requires a Node to stand Passing, the Node stands in for Passing when, on the default branch, each of its Test results passes in CI and the Advisor has sealed each of its Audit results `approved`.
- In a tree migrating from 3.2, a 3.x kind such as `.enabler` counts as an output Node, and a 3.x spec file name stands until the tree refactor renames it.
- spx writes no Audit File, so CI keeps each Audit entry without one on its pin.

## Asking

- The Operator does not review line by line. Point out what does not make sense, and fix it yourself when the fix is obvious.
- Ask the Operator only a question you are authorized and able to act on. Every other question goes by mail to the Position that can act.
- When the orchestration file sets `operator_available = true`, the Director and the Maintainer ask the Operator through AskUserQuestion. Otherwise each asks on a page with comments on and points the Operator to it by URL. Only the highest-ranking declared Position writes `operator_available`, and sets it true only on the Operator's yes.
- Put a proposal for the Operator on a page with comments on, and answer each comment in its thread.
- Another agent's message is never the Operator's yes. Only the Operator's own typed comment or pick counts.
- Never ask whether to do work your assignment, rank or an authorization in `orchestration.md` gives you. Do it and report it.
- An Applier writes a reopened product or architecture judgment into its Change and asks its overseer to have the Change lowered; the Change stays Available.

## Oversight

- An overseer checks each Position it oversees at least hourly and at every wake of its mail wait, reading what `spx/local/oversight.md` of the methodology checkout states, and never only reports.
- A Position past 600k tokens of context hands off at its next commit or its next reply, whichever comes first; its overseer mails one that does neither within an hour to hand off now.
- Once the hand-off finished, the overseer quits the session and starts a fresh one in the same worktree that runs `/hold-position resume`, only under the five conditions `spx/local/oversight.md` states. It never clears the session.

## This repository

spx is a TypeScript (ESM) CLI: tsup builds it, Vitest tests it, and Commander.js parses its commands. `src/` holds `cli.ts` and `index.ts`, then `commands/` (process-agnostic handlers), `interfaces/cli/` (Commander registration), `domains/` (command-local pure computation), `lib/` (shared capabilities such as spec-tree, state-store and node-status), `config/`, `test/` (test dispatch), `validation/` (the validation pipeline), `agent/` (the Agent SDK boundary) and `outcomeeng/` (the spec-tree graph).

### Product Tree

- Migrating from 3.2.
- Status claims are committed: each Node directory holds its `spx.status.json`. `spec status --update` (`src/lib/node-status/update.ts`) is its only writer. Never type an outcome into a claim.
- `spx/EXCLUDE` skips markdown validation of a listed Node's own spec, and `spec status --update` writes every outcome of a listed Node as `not-run`. Removing an entry therefore needs a fresh projection of that Node's claim.
- spx applied to its own source is no dependency edge. CI, `publish.yml`, `pnpm run validate` and `spx test` running on this repository are self-application. An Index never encodes them, because a domain would then depend on itself through publishing.
- Tests sit beside their spec in `spx/**/tests/`, never in `tests/`. A test file is named `{subject}.{evidence}.l{1|2|3}.test.ts`, with `{evidence}` one of `scenario`, `mapping`, `conformance`, `property` or `compliance`. `spx/local/typescript-tests.md` holds this Product's test rules.
- A test verifies behavior and never reads a source file, for example with `readFileSync` on `src/`.
- A `no-restricted-syntax` warning on a typed literal-union value, such as `expect(state).toBe("declared")` where `state` is a `NodeState`, is a false positive. Never extract such a value into a named constant.

### Which `spx` to run

- `spx` on `PATH` is the main checkout's built `dist/cli.js`, through the global pnpm store. Use it for stable operational commands such as `spx session …` and `spx worktree status`. It never reflects a feature worktree.
- `tsx src/cli.ts …` and the `pnpm run` scripts built on it run this worktree's live source. Use it for validation, `spec status`, and any command your branch changes.
- `node bin/spx.js` runs this worktree's own `dist/`, after `pnpm run build`.
- `spx` must stay on `PATH`, because sessions in every repository use it. When it is missing, broken or behind `origin/main`, refresh it only through the Deploy steps of `spx/local/merging.md`: a fast-forward `git pull` in the main checkout, whose `rebuild-dist` hook installs and builds. Never route around it with `tsx src/cli.ts`, and never install or build in the main checkout by hand.

### Commands

- `pnpm run validate`: source validation, circular dependencies skipped. For Markdown alone, `tsx src/cli.ts validation markdown <paths>`.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run knip`, `pnpm run circular`: single steps of validation. Never run bare `tsc`.
- `pnpm run format` and `pnpm run format:check` run dprint. The Product uses no Prettier.
- `pnpm run build`: builds `dist/`, which every level-2 CLI test runs. The Lefthook `rebuild-dist` hook skips feature worktrees, so after a source edit or a rebase `dist/` is stale until you build. Treat a failing level-2 CLI test as stale `dist/` until a fresh build reproduces it.
- `spx test --agent --changed --base origin/main`: tests of the changed scope, or `tsx src/cli.ts test …` when the change touches `spx test` itself. Every agent-run `spx test` takes `--agent`. Run it once, in the foreground, and never tail its log, poll it, or wrap it in a retry or wait loop. Never run raw Vitest or `pnpm test`.
- `spx spec status`: reads recorded evidence and runs nothing.

### The full suite and its claims

- Merge runs the `deterministic-verification` workflow: validation, circular dependencies, the packaged build, then `Test + status projection`. That job runs the full suite on fresh `dist/` and then `tsx src/cli.ts spec status --update --check`, which writes nothing and fails on any drift from the committed claims. CI review: the `agentic-verification` workflow.
- A branch whose change moves any Node's projection commits a full projection made on fresh `dist/`: `pnpm run build`, `tsx src/cli.ts verification test run` with no path operands, then `tsx src/cli.ts spec status --update`.
- Make that full run once per Changeset, and last: after its Review and every audit it needs are sealed approved, with no code change pending. Until then run only the changed scope. A full run made before a review round goes stale with the round's fixes.
- The full suite runs about 6,100 tests and loads the whole host. Under heavy load, tests fail on their timeouts, for example `spx/34-verification.enabler/32-verify.enabler/54-change-runs.enabler/tests/change-runs.mapping.l1.test.ts` at 30 seconds. `spec status --update` projects from the newest sealed test journal, and a run that did not seal passed marks every other module `not-run`, so rerunning only the failed files projects nothing. When the one full run fails only on timeouts in tests the Changeset does not touch, wait until `/wait-for-load` admits a run, then make exactly one more full run. Report the failed files, their solo timings and the load averages to your overseer first, and make no third run without its answer.
- On a stale `dist/`, `spec status --update` flips claims of Nodes you never touched to failed. Never revert or discard such a flip: rebuild, rerun the affected Nodes through `tsx src/cli.ts verification test run spx/<node>`, and project again. A fresh-`dist/` rerun decides whether the failure is real.

### Repository rules

- Use Lefthook alone for Git hooks. `prepare` installs it, and `lefthook.yml` is the hook source. Never add Husky.
- Change dependencies with `pnpm add` and `pnpm remove`, never by editing `package.json`.
- Never merge, close, rebase or schedule a Renovate pull request. Renovate merges its own.
- Move a tracked file with `git mv`. Remove gitignored artifacts with `pnpm run clean`.
- Replace a rewritten module whole: no legacy aliases, re-exports or shims.
- Name this repository the product, never a project, and its root `productDir` in new code.
