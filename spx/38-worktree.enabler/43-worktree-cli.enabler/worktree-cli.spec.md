---
id: 01a1f5b2-7fea-7b31-8f91-43d4876ccf51
---

# Worktree CLI

PROVIDES Commander.js bindings for `spx worktree status [worktree...]`, `spx worktree status --all`, `spx worktree claim --session-id <id>`, and `spx worktree release [--session-id <id>]`, with shared worktree-root resolution, controlling-process resolution, the silent-stdout claim contract, grouped human-readable status output, machine-parseable status output, and exit codes the marketplace consumers depend on
SO THAT `/handoff`, `/pickup`, manual repair flows, and compatibility flows
CAN claim, query, and release worktree occupancy with predictable output, exit codes, and shared worktree identity rules

## Assertions

### Test.Scenario: controlling process

- [controlling-pid-override](tests/worktree-controlling-process.scenario.l1.test.ts):
  - Given `SPX_WORKTREE_CONTROLLING_PID` names a live process
  - When the controlling process is resolved
  - Then the claim records that pid with its host and start time
- [agent-ancestor-pid](tests/worktree-controlling-process.scenario.l1.test.ts):
  - Given no override and a process ancestry in which an ancestor's command names a known agent runtime
  - When the controlling process is resolved
  - Then the claim records that ancestor's pid rather than the transient hook between it and spx
- [immediate-parent-pid](tests/worktree-controlling-process.scenario.l1.test.ts):
  - Given no override and no ancestor whose command names an agent runtime
  - When the controlling process is resolved
  - Then the claim records the immediate parent process

### Test.Scenario: claim and release

- [claim-written](tests/worktree-cli.scenario.l1.test.ts):
  - Given a worktree with no existing claim
  - When the claim handler runs for that worktree
  - Then a claim for the worktree is written under the resolved `.spx/worktrees` scope and the handler reports success
- [live-holder-claim-refused](tests/worktree-cli.scenario.l1.test.ts):
  - Given a worktree whose claim holder is live on the same host
  - When the claim handler runs for that worktree
  - Then the handler reports failure and leaves the live holder's claim unchanged
- [running-status-holder](tests/worktree-cli.scenario.l1.test.ts):
  - Given a worktree whose claim holder is live on the same host
  - When the status handler runs
  - Then it reports `running` with the holder's pid -- and in `--format json` carries the holder's `pid`, `session`, and `host` -- while a worktree with no claim and one whose holder is dead both report `free`
- [release-removes-claim](tests/worktree-cli.scenario.l1.test.ts):
  - Given the running worktree holds a claim
  - When the release handler runs
  - Then the claim is removed
- [other-session-release-refused](tests/worktree-cli.scenario.l1.test.ts):
  - Given the running worktree claim belongs to a different session
  - When the release handler runs
  - Then the handler reports failure and leaves that claim unchanged
- [explicit-session-release](tests/worktree-cli.scenario.l1.test.ts):
  - Given a running worktree claim recorded by session `S` with a live controlling process other than the caller's and no `SPX_WORKTREE_CONTROLLING_PID` override
  - When the release handler runs with `--session-id S`
  - Then the claim is removed
- [release-without-identity](tests/worktree-cli.scenario.l1.test.ts):
  - Given no `--session-id` and none of `CLAUDE_CODE_SESSION_ID`, `CODEX_THREAD_ID`, `ANTIGRAVITY_CONVERSATION_ID`, and `PI_SESSION_ID` non-empty, whatever `CLAUDE_SESSION_ID` holds
  - When the release handler runs
  - Then the handler reports failure
- [release-ambiguous-identity](tests/worktree-cli.scenario.l1.test.ts):
  - Given no `--session-id` and two or more of the four identity variables non-empty
  - When the release handler runs
  - Then the handler reports failure naming every one of the four it found set and leaves the claim unchanged

### Test.Scenario: status

- [current-worktree-status](tests/worktree-cli.scenario.l1.test.ts):
  - Given no worktree argument
  - When the status handler runs from within a worktree
  - Then it reports that worktree's occupancy, the same claim and release resolve from the running directory
- [all-worktrees-status](tests/worktree-cli.scenario.l1.test.ts):
  - Given `--all`
  - When the status handler runs from inside a git worktree pool
  - Then it reports every first-seen worktree root from git's worktree list using the same occupancy shape as multi-target status and emits an array for `--format json` even when the pool contains one worktree
- [all-with-operands-refused](tests/worktree-cli.scenario.l1.test.ts):
  - Given `--all` and explicit worktree operands
  - When the status handler runs
  - Then it rejects the ambiguous target selection
- [common-dir-scope-status](tests/worktree-cli.scenario.l1.test.ts):
  - Given a worktree claimed under its own git-common-dir scope
  - When the status handler runs with that worktree's path from an unrelated directory
  - Then it resolves the claim scope from the target worktree, not the caller's directory, and reports `running`
- [shell-expanded-paths-status](tests/worktree-cli.scenario.l1.test.ts):
  - Given shell expansion supplies multiple sibling paths to `spx worktree status`
  - When at least one path resolves to a worktree
  - Then text output reports each first-seen resolved worktree under its parent-directory group with that worktree's basename and occupancy, emits no line whose worktree name is `undefined`, and exits 0
- [grouped-text-status](tests/worktree-cli.scenario.l1.test.ts):
  - Given text status reports one or more worktrees
  - When their roots share or differ by parent directory
  - Then output groups worktrees under parent-directory headings and renders each child with its basename plus `-` for `free` or a runtime-qualified running pid for `running`
- [packaged-status-paths](tests/worktree-cli.scenario.l2.test.ts):
  - Given a claimed pool worktree
  - When `spx worktree status` is executed through `node bin/spx.js` from inside it, against its root path, and against a path within it
  - Then each reports the same occupancy as the claim, and `spx worktree status` of a single path that is not a worktree exits non-zero

### Test.Mapping: [worktree-target-resolution](tests/worktree-name-resolution.mapping.l1.test.ts)

Every target that denotes a worktree maps to that worktree's claim, and a bare basename that matches several git-observed worktree roots is refused as ambiguous, so status reports the occupancy claim recorded for a determinate worktree only.

| Case               | Target                                                             | Resolution            |
| ------------------ | ------------------------------------------------------------------ | --------------------- |
| worktree-root      | the worktree root                                                  | that worktree's claim |
| dot-from-within    | `.` or `./` from within the worktree                               | that worktree's claim |
| path-inside        | any path inside the worktree                                       | that worktree's claim |
| unique-basename    | a bare basename that uniquely matches a git-observed worktree root | that worktree's claim |
| ambiguous-basename | a bare basename that matches several git-observed worktree roots   | refused as ambiguous  |

### Test.Mapping: [scope-override-resolution](tests/worktree-name-resolution.mapping.l1.test.ts)

An explicit relative `.spx/worktrees` scope override for a worktree CLI command resolves from the command working directory, so claim, release, and status share the same absolute claim scope.

| Case    | Command                | Resolved claim scope                                     |
| ------- | ---------------------- | -------------------------------------------------------- |
| claim   | `spx worktree claim`   | the override resolved from the command working directory |
| release | `spx worktree release` | the override resolved from the command working directory |
| status  | `spx worktree status`  | the override resolved from the command working directory |

### Test.Property: claim names

- [safe-claim-name](tests/worktree-name.property.l1.test.ts): The worktree claim name derived from any basename is a safe scope token: lowercased, drawn only from letters, digits, hyphen, and underscore, with no leading, trailing, or repeated hyphen from collapsing unsafe runs.

### Test.Compliance: packaged commands

- [silent-claim](tests/worktree-cli.compliance.l2.test.ts): ALWAYS: a successful `spx worktree claim` executed through `node bin/spx.js` writes nothing to stdout and exits 0, so manual repair and compatibility flows can call it without adding model-visible context.
- [claim-held-refused](tests/worktree-cli.compliance.l2.test.ts): ALWAYS: `spx worktree claim` executed through `node bin/spx.js` exits non-zero when a live same-host holder already owns the worktree claim, and it leaves that holder's claim unchanged.
- [json-status-contract](tests/worktree-cli.compliance.l2.test.ts): ALWAYS: `spx worktree status [worktree...] --format json` executed through `node bin/spx.js` writes parseable JSON naming each first-seen resolved worktree's two-state occupancy -- and, for a `running` worktree, the holder's `pid`, `session`, and `host` -- and exits 0 when at least one worktree is reported, so `/pickup` can branch on `running` or `free`.
- [all-json-status](tests/worktree-cli.compliance.l2.test.ts): ALWAYS: `spx worktree status --all --format json` executed through `node bin/spx.js` writes a JSON array of occupancy objects for every git-observed worktree and exits 0, so pool-management flows can discover and read pool occupancy without constructing the worktree list.
- [failure-exit-diagnostic](tests/worktree-cli.compliance.l2.test.ts): ALWAYS: a `spx worktree` subcommand executed through `node bin/spx.js` exits non-zero when its operation fails, writing a diagnostic to stderr.
- [outside-path-refused](tests/worktree-name-resolution.compliance.l1.test.ts): NEVER: status reports a path outside every worktree as a `free` worktree -- single-target status refuses such a path with a diagnostic, and multi-target status excludes unresolved paths from reported occupancy.
- [text-status-escaping](tests/output-escaping.compliance.l1.test.ts): ALWAYS: every externally-originated value the text status report and the status refusals render — a worktree's parent directory and basename, and the operand a refusal names — carries its terminal-control bytes escaped, while the tree glyphs, labels, agent-runtime names, and line structure the product authored keep their bytes.
- [json-status-escaping](tests/output-escaping.compliance.l1.test.ts): ALWAYS: the JSON status report reaches the terminal with no raw control byte or DEL outside its own line structure, each written in JSON's own notation so a machine consumer decodes the holder's session, host, and pid verbatim.
