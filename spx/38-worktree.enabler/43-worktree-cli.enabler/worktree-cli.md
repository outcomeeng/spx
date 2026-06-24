# Worktree CLI

PROVIDES Commander.js bindings for `spx worktree status [worktree...]`, `spx worktree claim --session-id <id>`, and `spx worktree release`, with shared worktree-root resolution, controlling-process resolution, the silent-stdout claim contract, machine-parseable status output, and exit codes the marketplace consumers depend on
SO THAT `/handoff`, `/pickup`, manual repair flows, and compatibility flows
CAN claim, query, and release worktree occupancy with predictable output, exit codes, and shared worktree identity rules

## Assertions

### Scenarios

- Given `SPX_WORKTREE_CONTROLLING_PID` names a live process, when the controlling process is resolved, then the claim records that pid with its host and start time ([test](tests/worktree-controlling-process.scenario.l1.test.ts))
- Given no override and a process ancestry in which an ancestor's command names a known agent runtime, when the controlling process is resolved, then the claim records that ancestor's pid rather than the transient hook between it and spx ([test](tests/worktree-controlling-process.scenario.l1.test.ts))
- Given no override and no ancestor whose command names an agent runtime, when the controlling process is resolved, then the claim records the immediate parent process ([test](tests/worktree-controlling-process.scenario.l1.test.ts))
- Given a worktree with no existing claim, when the claim handler runs for that worktree, then a claim for the worktree is written under the resolved `.spx/worktrees` scope and the handler reports success ([test](tests/worktree-cli.scenario.l1.test.ts))
- Given a worktree whose claim holder is live on the same host, when the status handler runs, then it reports `running` with the holder's pid — and in `--format json` carries the holder's `pid`, `session`, and `host` — while a worktree with no claim and one whose holder is dead both report `free` ([test](tests/worktree-cli.scenario.l1.test.ts))
- Given the running worktree holds a claim, when the release handler runs, then the claim is removed ([test](tests/worktree-cli.scenario.l1.test.ts))
- Given no worktree argument, when the status handler runs from within a worktree, then it reports that worktree's occupancy, the same claim and release resolve from the running directory ([test](tests/worktree-cli.scenario.l1.test.ts))
- Given a worktree claimed under its own git-common-dir scope, when the status handler runs with that worktree's path from an unrelated directory, then it resolves the claim scope from the target worktree, not the caller's directory, and reports `running` ([test](tests/worktree-cli.scenario.l1.test.ts))
- Given shell expansion supplies multiple sibling paths to `spx worktree status`, when at least one path resolves to a worktree, then text output reports one line for each first-seen resolved worktree with that worktree's derived claim name and occupancy, emits no line whose worktree name is `undefined`, and exits 0 ([test](tests/worktree-cli.scenario.l1.test.ts), [test](tests/worktree-cli.scenario.l2.test.ts))
- Given a claimed pool worktree, when `spx worktree status` is executed through `node bin/spx.js` from inside it, against its root path, and against a path within it, then each reports the same occupancy as the claim, and `spx worktree status` of a single path that is not a worktree exits non-zero ([test](tests/worktree-cli.scenario.l2.test.ts))

### Mappings

- Every path that denotes a worktree — the worktree root, `.` or `./` from within it, or any path inside it — maps to that worktree's claim, so status reports the occupancy claim recorded for it ([test](tests/worktree-name-resolution.mapping.l1.test.ts))

### Properties

- The worktree claim name derived from any basename is a safe scope token: lowercased, drawn only from letters, digits, hyphen, and underscore, with no leading, trailing, or repeated hyphen from collapsing unsafe runs ([test](tests/worktree-name.property.l1.test.ts))

### Compliance

- ALWAYS: a successful `spx worktree claim` executed through `node bin/spx.js` writes nothing to stdout and exits 0, so manual repair and compatibility flows can call it without adding model-visible context ([test](tests/worktree-cli.compliance.l2.test.ts))
- ALWAYS: `spx worktree status [worktree...] --format json` executed through `node bin/spx.js` writes parseable JSON naming each first-seen resolved worktree's two-state occupancy — and, for a `running` worktree, the holder's `pid`, `session`, and `host` — and exits 0 when at least one worktree is reported, so `/pickup` can branch on `running` or `free` ([test](tests/worktree-cli.compliance.l2.test.ts))
- ALWAYS: a `spx worktree` subcommand executed through `node bin/spx.js` exits non-zero when its operation fails, writing a diagnostic to stderr ([test](tests/worktree-cli.compliance.l2.test.ts))
- NEVER: status reports a path outside every worktree as a `free` worktree — single-target status refuses such a path with a diagnostic, and multi-target status excludes unresolved paths from reported occupancy ([test](tests/worktree-name-resolution.compliance.l1.test.ts))
