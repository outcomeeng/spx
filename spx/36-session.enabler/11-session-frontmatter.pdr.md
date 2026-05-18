# Session Frontmatter

## Purpose

This decision governs the canonical YAML frontmatter shape for every session file managed by `spx session` — what fields exist, when each is populated, what `spx session handoff` and `spx session archive` enforce, and how readers treat sessions whose frontmatter omits structured fields.

## Context

**Business impact:** Sessions are the durable record of agent work. A picking-up agent decides which session to resume by reading the frontmatter — without structured `goal`, `next_step`, and `result` fields, that decision falls back to parsing free-form markdown bodies, which is slow, ambiguous, and frequently wrong. A structured shape turns the resume decision into a five-field comparison and turns archived sessions into a readable log of completed work.

**Technical constraints:** Sessions live in `.spx/sessions/{todo,doing,archive}/`. The directory is shared across worktrees per `spx/15-worktree-resolution.pdr.md` — the file lands at the Git common-dir product root, but the work that produced it lives in a specific worktree at a specific branch. The frontmatter is the only metadata channel the picker sees before opening the file. Empty piped content reaches `spx session handoff` regularly because the agent invoking the command does not know its `agent_session_id` ahead of time and cannot construct a fully-formed frontmatter before calling the CLI.

## Decision

Every session file carries the canonical frontmatter shape declared in this PDR. The shape has four populated-by-handoff fields, two prefilled-by-CLI fields, one populated-by-archive field, and two optional auto-injection arrays. The shape excludes `tags`. `spx session handoff` validates non-empty `goal` and `next_step`; `spx session archive` validates non-empty `result`. Sessions whose frontmatter omits structured fields remain readable through `list`, `show`, `pickup`, and `release` and are not re-emitted by handoff.

| Field              | Type     | Lifecycle                                                                                                                      | Default                                                                        | Validated by                                                                             |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `created_at`       | string   | Prefilled by `spx session handoff` from system clock                                                                           | -                                                                              | `spx session handoff` (presence)                                                         |
| `agent_session_id` | string   | Prefilled by `spx session handoff` from `$CLAUDE_SESSION_ID` then `$CODEX_THREAD_ID`                                           | absent when neither set                                                        | -                                                                                        |
| `priority`         | string   | Set by caller at handoff; defaults to `medium` when caller omits it                                                            | `medium`                                                                       | `spx session handoff` (one of the `SESSION_PRIORITY` values: `high`, `medium`, `low`)    |
| `branch`           | string   | Prefill-only by `spx session handoff` from `git rev-parse --abbrev-ref HEAD`; caller value ignored                             | -                                                                              | `spx session handoff` (non-empty, refuses detached HEAD with `SessionDetachedHeadError`) |
| `worktree`         | string   | Prefill-only by `spx session handoff`; relative path from Git common-dir parent to current worktree root; caller value ignored | `""` for non-worktree repos and for the main worktree of a multi-worktree repo | `spx session handoff` (string, may be empty)                                             |
| `goal`             | string   | Provided by caller at handoff                                                                                                  | -                                                                              | `spx session handoff` (non-empty)                                                        |
| `next_step`        | string   | Provided by caller at handoff                                                                                                  | -                                                                              | `spx session handoff` (non-empty)                                                        |
| `result`           | string   | Written by the claiming agent before `spx session archive`                                                                     | absent at handoff                                                              | `spx session archive` (non-empty)                                                        |
| `specs`            | string[] | Optional list of file paths for auto-injection on pickup                                                                       | `[]`                                                                           | -                                                                                        |
| `files`            | string[] | Optional list of file paths for auto-injection on pickup                                                                       | `[]`                                                                           | -                                                                                        |

## Rationale

Goal, next_step, and result form the resume cycle: the handing-off agent declares why this session exists (`goal`) and what to do first (`next_step`); the claiming agent records what it accomplished (`result`) before archiving. A future agent reading `.spx/sessions/archive/` sees a readable history of completed work in one place, not scattered across markdown bodies of variable shape.

Branch and worktree are the missing link in the worktree-sharing contract from `spx/15-worktree-resolution.pdr.md`. The PDR-15 design puts `.spx/sessions/` at the Git common-dir root so every worktree sees the same queue, but the queue alone tells the picker nothing about where to do the work. With `branch` and `worktree` in the frontmatter, the picker selects a session, switches to the named worktree, and continues. Without them, the picker has to read the body and infer.

The `worktree` field is the empty string for both non-worktree repositories and the main worktree of a multi-worktree repository — the picker uses the empty value as a single signal that no worktree switch is required, and `branch` distinguishes the work context within whichever checkout the session was created in. A reader of an archived session sees `worktree: ""` and reads it as "main checkout" without needing to know whether the repository had linked worktrees at handoff time.

Empty piped content is rejected at handoff. Substituting a default body for empty content satisfies the directory and filename contract but produces a session that carries no handoff information; rejecting empty content prevents that failure mode. The agent has the goal and next_step at the moment of handoff; requiring them costs nothing. `created_at` and `agent_session_id` are prefilled because the agent does not know them; everything else the agent does know.

The `result` field is populated by direct edit of the session file under `.spx/sessions/doing/<id>.md` before `spx session archive` runs. The CLI surfaces no `spx session update` or `spx session set-result` command because the file is markdown and the agent already edits it during the working session — the act of writing `result` is the act of closing the work, not a separate transaction. The alternatives section above rejects the `--result "..."` flag for the same reason: a second path duplicates the edit without changing what the agent must do.

Tags are absent from the shape. The structured fields above serve every coordination use case tags would carry.

The auto-injection arrays (`specs`, `files`) default to `[]` rather than `undefined` so consumers iterate uniformly. Auto-injection itself is governed by `spx/36-session.enabler/21-auto-injection.adr.md`.

Alternatives considered:

- **Keep the priority+tags+created_at shape; add branch/worktree/goal/next_step/result as optional fields**: Optional structured fields rot. Without enforcement, sessions land with empty goals and the picker is back to reading the body. Required-at-write is the only durable contract.
- **Two-session lineage in frontmatter (`previous_result` in the new session)**: Embeds session chains but requires the handing-off agent to know which session it descends from. Adds a hop the picker must traverse. The single-session shape (each session carries its own goal/result/next_step) is simpler and the lineage is already implicit through `created_at` ordering.
- **Migration script that backfills branch/worktree on sessions whose frontmatter lacks structured fields**: Adds CLI surface and an interactive prompt for goal/next_step/result that the user does not need. Tolerate-at-read is sufficient given the queue is small in practice and unstructured sessions drain through normal pickup/archive or are deleted manually.
- **CLI flag for result (`spx session archive <id> --result "..."`)**: Adds a second path to populate the same field. The agent edits the file already to fill `result`; a flag duplicates that with no behavior change for the common case.

## Trade-offs accepted

| Trade-off                                                                               | Mitigation / reasoning                                                                                                                    |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Handoff requires git context to prefill branch and worktree                             | `spx session handoff` already resolves the Git common-dir per `spx/15-worktree-resolution.pdr.md`; the same call gives both fields        |
| Archive cannot be a single command for sessions where result is still being filled      | The claiming agent edits the file as it works; archive is the explicit terminator and refusing on empty `result` keeps the log honest     |
| Sessions whose frontmatter lacks structured fields render with empty values             | Read tolerance keeps those sessions visible without weakening the write contract; sessions handoff produces under this PDR render in full |
| Worktree path encoded as relative to common-dir parent, not absolute                    | Absolute paths break when the repo is checked out at a different root; the relative form is portable across machines                      |
| Five validated fields at handoff is more friction than a single content-non-empty check | A single non-empty-body check accepts sessions with no handoff payload; the per-field validation buys a structured resume                 |

## Product invariants

- `spx session list` shows the goal and next_step of every session this PDR governs — the agent picking a session reads the work to do without opening the file
- `spx session archive` refuses any session with an empty or absent `result` — the archive directory is a log of completed work, not a graveyard of unfinished sessions
- `spx session pickup` of a session this PDR governs reveals which worktree and branch produced the work — the agent resumes in the right working copy without inferring from the body
- A session whose frontmatter omits structured fields remains readable by every command — pickup, show, list, release tolerate missing structured fields and render them as empty

## Compliance

### Recognized by

A session file written by `spx session handoff` contains a YAML frontmatter with `priority`, `branch`, `worktree`, `goal`, `next_step` keys, where `goal` and `next_step` are non-empty strings and `worktree` is a path relative to the parent of the Git common directory. A session moved to `archive/` by `spx session archive` contains a non-empty `result` key.

### MUST

- `spx session handoff` rejects piped content that lacks a non-empty `goal` and a non-empty `next_step` — `goal` and `next_step` are the handoff payload ([review])
- `spx session handoff` prefills `branch` from `git rev-parse --abbrev-ref HEAD` and `worktree` from the relative path between the Git common-dir parent and the current worktree root; both fields are prefill-only and caller-supplied values are ignored ([review])
- `spx session handoff` refuses to write a session when HEAD is detached — the command exits non-zero with `SessionDetachedHeadError` because a detached HEAD has no branch ref that identifies the working context ([review])
- `spx session handoff` prefills `created_at` as an ISO-8601 timestamp with timezone offset per `spx/36-session.enabler/21-timestamp-format.adr.md` ([review])
- `spx session handoff` prefills `agent_session_id` from `$CLAUDE_SESSION_ID` when set, falling back to `$CODEX_THREAD_ID` — when neither is set, the field is absent from the frontmatter ([review])
- `spx session archive` refuses any session whose `result` is empty or absent — the agent fills the field before invoking archive ([review])
- `spx session list`, `spx session show`, `spx session pickup`, and `spx session release` render missing structured fields as empty strings without rejecting the session — read tolerance keeps sessions whose frontmatter omits structured fields usable ([review])
- The `worktree` value is the empty string when the working copy is the main checkout — for both non-worktree repositories and the main worktree of a multi-worktree repository the picker needs no worktree switch, so both cases share the same observable `worktree` semantic ([review])
- `spx session handoff` serializes `branch` and `worktree` through YAML scalar quoting before writing — the raw `git rev-parse` output and raw worktree-relative path string are not embedded verbatim in the frontmatter document, so branch names and paths containing YAML-special characters (`:`, `{`, `}`, `#`, `|`, `\`, quotes, spaces) round-trip cleanly through `parseSessionMetadata` ([review])

### NEVER

- `spx session handoff` substitutes a default body for empty piped content — empty handoffs are rejected with `SessionInvalidContentError` ([review])
- `spx session archive` writes a session to `archive/` with an empty or absent `result` — archived sessions are completed work, not abandoned work ([review])
- The frontmatter carries a `tags` key on any session this PDR governs — the shape excludes `tags` ([review])
- The frontmatter carries a `working_directory` key on any session this PDR governs — the shape excludes `working_directory`, which is superseded by `worktree` ([review])
- `spx session handoff` invents a value for `agent_session_id` when both environment variables are absent — the field is omitted, not populated with a placeholder ([review])
- Any command embeds session lineage (`previous_session_id`, `previous_result`) in the frontmatter — each session carries its own goal/next_step/result ([review])
- `spx session handoff` accepts caller-supplied `branch` or `worktree` values — both fields are sourced from git context regardless of frontmatter content ([review])
