# Worktree CLI

PROVIDES Commander.js bindings for `spx worktree status <worktree>`, `spx worktree claim --session-id <id>`, and `spx worktree release`, with controlling-process resolution, the silent-stdout claim contract, machine-parseable status output, and exit codes the marketplace consumers depend on
SO THAT the SessionStart hook, `/handoff`, and `/pickup`
CAN claim, query, and release worktree occupancy as a subprocess with predictable output and exit codes

Controlling-process resolution and the command surface are governed by [`spx/38-worktree.enabler/43-worktree-cli.enabler/21-worktree-command.adr.md`](21-worktree-command.adr.md). The claim store and classification are provided by [`spx/38-worktree.enabler/32-occupancy-store.enabler`](../32-occupancy-store.enabler/occupancy-store.md).

## Assertions

### Scenarios

- Given `SPX_WORKTREE_CONTROLLING_PID` names a live process, when the controlling process is resolved, then the claim records that pid with its host and start time ([test](tests/worktree-controlling-process.scenario.l1.test.ts))
- Given no override and a process ancestry in which an ancestor's command names a known agent runtime, when the controlling process is resolved, then the claim records that ancestor's pid rather than the transient hook between it and spx ([test](tests/worktree-controlling-process.scenario.l1.test.ts))
- Given no override and no ancestor whose command names an agent runtime, when the controlling process is resolved, then the claim records the immediate parent process ([test](tests/worktree-controlling-process.scenario.l1.test.ts))
- Given an unclaimed worktree, when the claim handler runs for that worktree, then a claim for the worktree is written under the resolved `.spx/worktrees` scope and the handler reports success ([test](tests/worktree-cli.scenario.l1.test.ts))
- Given a worktree whose claim holder is live on the same host, when the status handler runs, then it reports occupied; an unclaimed worktree reports unclaimed and a dead holder reports stale ([test](tests/worktree-cli.scenario.l1.test.ts))
- Given the running worktree holds a claim, when the release handler runs, then the claim is removed ([test](tests/worktree-cli.scenario.l1.test.ts))

### Compliance

- ALWAYS: a successful `spx worktree claim` executed through `node bin/spx.js` writes nothing to stdout and exits 0 — the SessionStart hook injects a command's stdout into the agent's context, so the claim must stay silent ([test](tests/worktree-cli.compliance.l2.test.ts))
- ALWAYS: `spx worktree status <worktree> --format json` executed through `node bin/spx.js` writes a parseable JSON record naming the occupancy status and exits 0, so `/pickup` can branch on occupied, unclaimed, or stale ([test](tests/worktree-cli.compliance.l2.test.ts))
- ALWAYS: a `spx worktree` subcommand executed through `node bin/spx.js` exits non-zero when its operation fails, writing a diagnostic to stderr ([test](tests/worktree-cli.compliance.l2.test.ts))
