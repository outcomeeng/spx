# Agent guide

Before any other step, pull the methodology checkout `/Users/shz/Code/outcomeeng/methodology/methodology/` and read the parts in `versions/<version>/parts/` your work needs: `product-tree.md` before you read or change a file under `spx/`, `change.md` before you record, refine, apply, audit or close a Change, and `positions.md` when you hold a Position or oversee one. `<version>` is the major and minor of `methodology.version` in this repository's `spx.config.yaml`. Methodology governs all work here, except where this guide departs from it. Each departure is deliberate: no one reports it as a finding, files it in an `ISSUES.md`, or records a Change for it. Where a skill and methodology differ, methodology holds.

## Skills

Use only these skills:

- `hold-position`: run `/hold-position resume` when a session starts and `/hold-position hand-off` before its context is cleared; it also handles your mail.
- `product-tree:author-change` and `product-tree:manage-change`: recording a Change and making its Transitions.
- `product-tree:merge`: merging a Changeset.
- `product-tree:change-standards`, `interview`, `commit-changes`, `sync-base`, `merging-standards`, `manage-github-pr`, `open-pr` and `manage-pr`: the steps the skills above invoke.
- `coding-agents:operate-prowl`, `coding-agents:operate-herdr` and `orca-cli`: starting, reading, prompting, clearing and resuming the panes of the Positions you oversee.

Every other skill is out because it does not work for methodology 4.0, and that is why every Audit and Review runs by hand through the Advisor. A Change that brings a skill to 4.0 ends part of that hand work, so judge its cost of delay by the hand work it ends, never by how rarely the broken skill runs today.

Load product context through methodology's Queries (`product-tree/context.md` in outcomeeng/methodology). Never invoke `product-tree:understand` or `product-tree:contextualize`.

## Oversight

- An overseer checks each Position it oversees at least once an hour and at every wake of its mail wait: the session's state through `orca agent list --json`, what it last said through `orca agent read <session id>`, its context, its held Changes in the Change Store, and the mail it leaves unanswered. It restarts a session held at a prompt of its harness, prompts a session that stopped mid-work, unblocks a held Change idle for an hour or unanswered mail where that lies in its scope, escalates the rest, and never only reports.
- A Claude Code session's context is the sum of `input_tokens`, `cache_read_input_tokens` and `cache_creation_input_tokens` in the last assistant turn of the transcript `<session id>.jsonl` under `~/.claude/projects/`, where `spx worktree status --format json` in its worktree names the session id in its `session` field.

## Departures from methodology

<until-control-position>

- An overseer, in place of the Controller, has a Position past 600k tokens of context hand off at its next commit. It reads in the pane that the hand-off finished, then clears the session and has it resume through `orca terminal send`, never in a pane whose last prompt came from the Operator.

</until-control-position>

- You write every artifact and every repair yourself. You launch no subagent.
- Your Product's Advisor is the Auditor and Reviewer of every Audit and Review, in its own session. Send each to it by mail. It judges against methodology, uses no audit or review skill, seals each verdict with `spx verification run` in the form `manage-change` and `merge` read, and returns the run token.
- Pass the Advisor's token where a skill would launch a Verifier. Where a skill launches one and takes no token, launch none, and go on only once the Advisor's run is sealed `approved` with no finding.
- The Advisor reviews every Changeset. Where the repository runs a CI review, merge waits for both.
- The Advisor seals a Review of a Changeset with four commands, each payload in a scratch file. First `spx verification run start --verification-type review --scope-type changeset --scope <base>..<head> --input <diff file> --expectations <file> --verifier agent:spx-advisor`, the expectations file holding `{"schemaVersion":1,"additionalPaths":[]}`; it prints the run token. Then `spx verification run scope add` with the same type and scope, `--run <token>`, `--payload <file>` and `--idempotency-key scope-1`, one unit for the whole Changeset: `{"path":"<a changed path>","side":"RIGHT","commit":"<head>","coverageState":"clean","judgedPaths":[<every changed path the head holds>]}`. A Changeset that deletes files adds a second unit with `--idempotency-key scope-2`: `{"path":"<a changed path>","side":"RIGHT","commit":"<head>","coverageState":"clean","judgedDeletions":[<every deleted path>]}`. For each finding, `spx verification run finding add` with `--idempotency-key finding-<n>` and `{"originalCommit":"<head>","body":"<the finding>","finding":{"disposition":"BLOCKING","summary":"<one line>"}}`. Last, `spx verification run finish` with `--terminal-status approved` when no finding stands, `rejected` otherwise.
- An Audit of a Change record runs the same four commands without `--expectations`, with `--verification-type audit --scope-type file --scope <owner/repo#N> --change <owner/repo#N>` and the record body as input. It adds one scope unit for the record, one for each Declarations subsection and one for the Verification line. Each scope unit takes `--idempotency-key scope-<n>` and carries `unitId` (`change:<part>:<owner/repo#N>`, the record's own unit with the part `root`), `auditClass` `coordination`, `auditKind` `change`, `subject`, `coverageRequirement`, `coverageStatus`, `priorContext`, `expectedProducer`, `recordedByRunDriver` and `producerProvenance`; every unit after the root names the root's `unitId` in `parentUnitId`. Each finding carries `unitId`, `producerIdentity`, `producerProvenance`, `rule`, `severity`, `location`, `message` and `evidence` (`observed`, `expected`). The sealed audit runs under `.spx/branch/*/audit/runs/` of the worktree pool show each field.
- Fix each valid blocking finding. After two rejections of one Audit or Review on a Change, mail your overseer both, and continue as the answer states.
- In a tree migrating from 3.2, a 3.x kind such as `.enabler` counts as an output Node, and a 3.x spec file name such as `spx.product.md` or `<slug>.md` stands until the tree refactor renames it.
- spx writes no Audit File, so CI keeps each Audit entry without one on its pin.
- Run no eval. Wherever a Node records eval evidence, or a row's verification type is Evaluate, the Advisor audits that row in place of the run: it judges each case of the eval against the producer's output, seals the verdict with `spx verification run` as for every Audit, and returns the run token. Write each eval as methodology states. A claim a Decision Record gives eval evidence stands on that audit, and no one reports a missing eval run as a finding.
- In a repository whose guide states that no Node is Passing, where methodology requires a Node to stand Passing, the Node stands in for Passing when, on the default branch, each of its Test results passes in CI and the Advisor has sealed each of its Audit results `approved`. The stand-in lapses once the repository commits its `spx.status.json` claims.

## Asking

- When the orchestration file sets `operator_available = true`, the Director and the Maintainer ask the Operator through `request_user_input`. Otherwise the Maintainer mails the Director, and the Director, or the Maintainer where no Director is declared, asks on the page that holds the subject.
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
