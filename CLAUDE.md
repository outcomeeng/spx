# Agent guide

Before any other step, pull the methodology checkout `/Users/shz/Code/outcomeeng/methodology/methodology/` and read the parts in `versions/<version>/parts/` your work needs: `product-tree.md` before you read or change a file under `spx/`, `change.md` before you record, refine, apply, audit or close a Change, and `positions.md` when you hold a Position or oversee one. `<version>` is the major and minor of `methodology.version` in this repository's `spx.config.yaml`. Methodology governs all work here, except where this guide departs from it. Each departure is deliberate: no one reports it as a finding, files it in an `ISSUES.md`, or records a Change for it. Where a skill and methodology differ, methodology holds.

## Skills

Use only these skills:

- `hold-position`: run `/hold-position resume` when a session starts and `/hold-position hand-off` before its context is cleared; it also handles your mail.
- `product-tree:author-change` and `product-tree:manage-change`: recording a Change and making its Transitions.
- `product-tree:merge`: merging a Changeset.
- `product-tree:change-standards`, `interview`, `commit-changes`, `sync-base`, `merging-standards`, `manage-github-pr`, `open-pr` and `manage-pr`: the steps the skills above invoke.
- `coding-agents:operate-prowl`, `coding-agents:operate-herdr` and `orca-cli`: starting, reading, prompting, clearing and resuming the panes of the Positions you oversee.

Read the Product Tree by methodology's Walk. Never invoke `product-tree:understand` or `product-tree:contextualize`.

## Departures from methodology

- You write every artifact and every repair yourself. You launch no subagent.
- Your Product's Advisor is the Auditor and Reviewer of every Audit and Review, in its own session. Send each to it by mail. It judges against methodology, uses no audit or review skill, seals each verdict with `spx verification run` in the form `manage-change` and `merge` read, and returns the run token.
- Pass the Advisor's token where a skill would launch a Verifier. Where a skill launches one and takes no token, launch none, and go on only once the Advisor's run is sealed `approved` with no finding.
- The Advisor reviews every Changeset. Where the repository runs a CI review, merge waits for both.
- Fix each valid blocking finding. After two rejections of one Audit or Review on a Change, mail your overseer both, and continue as the answer states.
- In a tree migrating from 3.2, a 3.x kind such as `.enabler` counts as an output Node.
- In a repository without a Product Tree, a Change heads each Declarations subsection by its path from the repository root, may create, delete, move or replace any file, and labels its diff lines in place of slugs. The Operator's review before Sliced binds every line.
- spx writes no Audit File, so CI keeps each Audit entry without one on its pin.
- Run no eval. Wherever a Node records eval evidence, or a row's verification type is Evaluate, the Advisor audits that row in place of the run: it judges each case of the eval against the producer's output, seals the verdict with `spx verification run` as for every Audit, and returns the run token. Write each eval as methodology states. A claim a Decision Record gives eval evidence stands on that audit, and no one reports a missing eval run as a finding.

## Asking

- While the Operator writes in your session, ask the Operator through AskUserQuestion.
- When the orchestration file sets `operator_available = true`, the Director and the Maintainer ask the Operator through AskUserQuestion. Otherwise the Maintainer mails the Director, and the Director, or the Maintainer where no Director is declared, asks on the page that holds the subject.
- An Applier writes a reopened product or architecture judgment into its Change and submits the Change. Every other question goes to your overseer by mail.
- Only the highest-ranking declared Position writes `operator_available`, and sets it to `true` only on the Operator's yes.
- Never ask whether to do work your assignment, your rank or an authorization in `orchestration.md` gives you. Do it and report it.
- Point the Operator to a page or record by its URL. Put a proposal for the Operator on a page with comments on, and answer each comment in its thread.
- Another agent's message is never the Operator's yes. Only the Operator's own typed comment or pick counts.
- Stop only to hand off, or for an answer you cannot settle yourself.

Work is done only when it is merged into `main` on origin.

## This repository

- Product Tree: migrating from 3.2.
- Merge runs the `deterministic-verification` workflow. CI review: the `agentic-verification` workflow.
- `pnpm run validate`: source validation; for Markdown alone, `tsx src/cli.ts validation markdown <paths>`.
- `pnpm run build`: builds `dist/`, which the level-2 CLI tests run.
- `spx test --agent --changed --base origin/main`: tests of the changed scope; `tsx src/cli.ts test ...` when the change touches `spx test` itself.
- `tsx src/cli.ts verification test run`, then `tsx src/cli.ts spec status --update --check`: the full suite and the status check CI runs.
