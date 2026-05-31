# Session Frontmatter

## Purpose

This decision governs the canonical YAML frontmatter shape for every session file managed by `spx session` — what fields exist, when each is populated, what `spx session handoff` and `spx session archive` enforce, and how readers treat sessions whose frontmatter omits structured fields.

## Context

**Business impact:** Sessions are the durable record of agent work. A picking-up agent decides which session to resume by reading the frontmatter — without structured `goal`, `next_step`, and `result` fields, that decision falls back to parsing free-form markdown bodies, which is slow, ambiguous, and frequently wrong. A structured shape turns the resume decision into a five-field comparison and turns archived sessions into a readable log of completed work.

**Technical constraints:** Sessions live in `.spx/sessions/{todo,doing,archive}/`. The directory is shared across worktrees per `spx/15-worktree-resolution.pdr.md` — the file lands at the Git common-dir product root, but the work that produced it lives in a specific worktree at a specific branch. The frontmatter is the only metadata channel the picker sees before opening the file. Empty piped content reaches `spx session handoff` regularly because the agent invoking the command does not know its `agent_session_id` ahead of time and cannot construct a fully-formed frontmatter before calling the CLI.

## Decision

Every session file carries the canonical frontmatter shape declared in this PDR. The shape has four populated-by-handoff fields, two prefilled-by-CLI fields, one populated-by-archive field, and two optional auto-injection arrays. The shape excludes `tags`. `spx session handoff` validates non-empty `goal` and `next_step`. A session is **canonical** when its frontmatter parses into the shape this PDR declares and **non-canonical** when it does not. `spx session archive` validates non-empty `result` for a canonical session; it moves a non-canonical session to `archive/` unchanged without a `result` requirement. Sessions whose frontmatter omits structured fields remain readable through `list`, `show`, `pickup`, and `release` and are not re-emitted by handoff.

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

`spx session handoff` accepts caller-supplied structured fields as a JSON object at the start of stdin, followed by the body as the remaining bytes verbatim. A single `LF` or `CRLF` immediately after the JSON object's closing brace is consumed as a separator and is not part of the body. The on-disk frontmatter format remains YAML. Input opening with the YAML-frontmatter delimiter is rejected with `SessionLegacyFrontmatterInputError`.

## Rationale

Goal, next_step, and result form the resume cycle: the handing-off agent declares why this session exists (`goal`) and what to do first (`next_step`); the claiming agent records what it accomplished (`result`) before archiving. A future agent reading `.spx/sessions/archive/` sees a readable history of completed work in one place, not scattered across markdown bodies of variable shape.

Branch and worktree are the missing link in the worktree-sharing contract from `spx/15-worktree-resolution.pdr.md`. The PDR-15 design puts `.spx/sessions/` at the Git common-dir root so every worktree sees the same queue, but the queue alone tells the picker nothing about where to do the work. With `branch` and `worktree` in the frontmatter, the picker selects a session, switches to the named worktree, and continues. Without them, the picker has to read the body and infer.

The `worktree` field is the empty string for both non-worktree repositories and the main worktree of a multi-worktree repository — the picker uses the empty value as a single signal that no worktree switch is required, and `branch` distinguishes the work context within whichever checkout the session was created in. A reader of an archived session sees `worktree: ""` and reads it as "main checkout" without needing to know whether the repository had linked worktrees at handoff time.

Empty piped content is rejected at handoff. Substituting a default body for empty content satisfies the directory and filename contract but produces a session that carries no handoff information; rejecting empty content prevents that failure mode. The agent has the goal and next_step at the moment of handoff; requiring them costs nothing. `created_at` and `agent_session_id` are prefilled because the agent does not know them; everything else the agent does know.

The `result` field is populated by direct edit of the session file under `.spx/sessions/doing/<id>.md` before `spx session archive` runs. The CLI surfaces no `spx session update` or `spx session set-result` command because the file is markdown and the agent already edits it during the working session — the act of writing `result` is the act of closing the work, not a separate transaction. The alternatives section above rejects the `--result "..."` flag for the same reason: a second path duplicates the edit without changing what the agent must do.

The non-empty-`result` requirement binds only canonical sessions. `result` answers `goal`; a non-canonical session carries no `goal` for it to answer, so demanding a `result` before archive is incoherent, and refusing the archive would strand the session in `todo/` or `doing/` with no command able to satisfy the check. `spx session archive` classifies a session by whether its frontmatter parses into the shape this PDR declares: a parse that throws for any reason — frontmatter that omits the shape, frontmatter that carries excluded keys such as `tags`, or frontmatter that is malformed — marks the session non-canonical and archivable as-is. Archive moves the file by rename, so a non-canonical session keeps its original frontmatter and read tolerance keeps it legible in `archive/`.

Tags are absent from the shape. The structured fields above serve every coordination use case tags would carry.

The auto-injection arrays (`specs`, `files`) default to `[]` rather than `undefined` so consumers iterate uniformly. Auto-injection itself is governed by `spx/36-session.enabler/21-auto-injection.adr.md`.

JSON is the input wire format because every caller-supplied string scalar is unambiguously quoted by definition — there is no plain-scalar mode, no comment syntax, and no leading-character ambiguity. The optional separator accepts both `LF` and `CRLF` because shell pipelines on different platforms can normalize line endings before stdin reaches the CLI. The on-disk format remains YAML so markdown-aware tools fold the frontmatter on render and human edits of the `result` field use YAML block scalars. The wire format is the format in which agents construct input; the on-disk format is the format in which humans and tools read sessions; the two need not be the same.

Alternatives considered:

- **Keep the priority+tags+created_at shape; add branch/worktree/goal/next_step/result as optional fields**: Optional structured fields rot. Without enforcement, sessions land with empty goals and the picker is back to reading the body. Required-at-write is the only durable contract.
- **Two-session lineage in frontmatter (`previous_result` in the new session)**: Embeds session chains but requires the handing-off agent to know which session it descends from. Adds a hop the picker must traverse. The single-session shape (each session carries its own goal/result/next_step) is simpler and the lineage is already implicit through `created_at` ordering.
- **Migration script that backfills branch/worktree on sessions whose frontmatter lacks structured fields**: Adds CLI surface and an interactive prompt for goal/next_step/result that the user does not need. Tolerate-at-read is sufficient given the queue is small in practice and unstructured sessions drain through normal pickup/archive or are deleted manually.
- **CLI flag for result (`spx session archive <id> --result "..."`)**: Adds a second path to populate the same field. The agent edits the file already to fill `result`; a flag duplicates that with no behavior change for the common case.

## Trade-offs accepted

| Trade-off                                                                               | Mitigation / reasoning                                                                                                                                                                            |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handoff requires git context to prefill branch and worktree                             | `spx session handoff` already resolves the Git common-dir per `spx/15-worktree-resolution.pdr.md`; the same call gives both fields                                                                |
| Archive cannot be a single command for sessions where result is still being filled      | The claiming agent edits the file as it works; archive is the explicit terminator and refusing on empty `result` keeps the log honest                                                             |
| Sessions whose frontmatter lacks structured fields render with empty values             | Read tolerance keeps those sessions visible without weakening the write contract; sessions handoff produces under this PDR render in full                                                         |
| Worktree path encoded as relative to common-dir parent, not absolute                    | Absolute paths break when the repo is checked out at a different root; the relative form is portable across machines                                                                              |
| Five validated fields at handoff is more friction than a single content-non-empty check | A single non-empty-body check accepts sessions with no handoff payload; the per-field validation buys a structured resume                                                                         |
| Archive admits a non-canonical session with no `result`                                 | The canonical-shape parse is the classifier — only sessions that already satisfy the shape are held to the `result` contract, and a non-canonical session would otherwise be unarchivable forever |

## Product invariants

- `spx session list` shows the goal and next_step of every session this PDR governs — the agent picking a session reads the work to do without opening the file
- `spx session archive` refuses any canonical session with an empty or absent `result` — the archive directory is a log of completed work, not a graveyard of unfinished sessions
- `spx session archive` moves a non-canonical session — one whose frontmatter does not parse into this PDR's shape — to `archive/` without a `result` requirement, so no session is permanently trapped in `todo/` or `doing/`
- `spx session pickup` of a session this PDR governs reveals which worktree and branch produced the work — the agent resumes in the right working copy without inferring from the body
- A session whose frontmatter omits structured fields remains readable by every command — pickup, show, list, release tolerate missing structured fields and render them as empty
- `spx session handoff` preserves every caller-supplied string field exactly — values containing any unicode codepoint round-trip identically from caller input to the parsed metadata of the written session file
- `spx session handoff` rejects input opening with the YAML-frontmatter delimiter with a discoverable error — agents that emit the legacy shape receive a clear signal rather than silently truncated content

## Compliance

### Recognized by

A session file written by `spx session handoff` contains a YAML frontmatter with `priority`, `branch`, `worktree`, `goal`, `next_step` keys, where `goal` and `next_step` are non-empty strings and `worktree` is a path relative to the parent of the Git common directory. A canonical session moved to `archive/` by `spx session archive` contains a non-empty `result` key; a non-canonical session — one whose frontmatter does not parse into this shape — can be moved to `archive/` with no `result` key.

### MUST

- `spx session handoff` rejects piped content that lacks a non-empty `goal` and a non-empty `next_step` — `goal` and `next_step` are the handoff payload ([review])
- `spx session handoff` prefills `branch` from `git rev-parse --abbrev-ref HEAD` and `worktree` from the relative path between the Git common-dir parent and the current worktree root; both fields are prefill-only and caller-supplied values are ignored ([review])
- `spx session handoff` refuses to write a session when HEAD is detached — the command exits non-zero with `SessionDetachedHeadError` because a detached HEAD has no branch ref that identifies the working context ([review])
- `spx session handoff` prefills `created_at` as an ISO-8601 timestamp with timezone offset per `spx/36-session.enabler/21-timestamp-format.adr.md` ([review])
- `spx session handoff` prefills `agent_session_id` from `$CLAUDE_SESSION_ID` when set, falling back to `$CODEX_THREAD_ID` — when neither is set, the field is absent from the frontmatter ([review])
- `spx session archive` refuses any canonical session whose `result` is empty or absent — the agent fills the field before invoking archive ([review])
- `spx session archive` moves a non-canonical session — one whose frontmatter does not parse into this PDR's shape, for any parse failure — to `archive/` without requiring `result`, preserving the file's frontmatter unchanged ([review])
- The parse that classifies a session as canonical conforms strictly to the shape this PDR declares: it throws when the frontmatter carries a key outside the shape (such as `tags` or `working_directory`) or omits the populated-by-handoff fields, so the canonical/non-canonical boundary does not depend on YAML-library leniency toward unrecognized keys ([review])
- `spx session list`, `spx session show`, `spx session pickup`, and `spx session release` render missing structured fields as empty strings without rejecting the session — read tolerance keeps sessions whose frontmatter omits structured fields usable ([review])
- The `worktree` value is the empty string when the working copy is the main checkout — for both non-worktree repositories and the main worktree of a multi-worktree repository the picker needs no worktree switch, so both cases share the same observable `worktree` semantic ([review])
- `spx session handoff` writes every string-typed frontmatter field through YAML scalar quoting — `branch` and `worktree` (raw git output), `agent_session_id` (raw environment variable), `goal` and `next_step` (raw caller-supplied content), and `created_at` (formatted timestamp) all flow through the `yaml` package's `stringify` so values containing YAML-special characters (`:`, `{`, `}`, `#`, `|`, `\`, quotes, spaces, newlines) round-trip cleanly through `parseSessionMetadata` ([review])
- `spx session handoff` accepts caller-supplied structured fields as a JSON object at the start of stdin, consumes at most one immediately following `LF` or `CRLF` separator, and treats the bytes after that separator as the body verbatim — JSON quoting semantics preserve caller content without parse ambiguity ([review])

### NEVER

- `spx session handoff` substitutes a default body for empty piped content — empty handoffs are rejected with `SessionInvalidContentError` ([review])
- `spx session archive` writes a canonical session to `archive/` with an empty or absent `result` — archived sessions are completed work, not abandoned work ([review])
- The frontmatter of a canonical session carries a `tags` key — the canonical shape excludes `tags`; a non-canonical session may carry it and is governed only by the archive path above ([review])
- The frontmatter of a canonical session carries a `working_directory` key — the canonical shape excludes `working_directory`, which is superseded by `worktree`; a non-canonical session may carry it and is governed only by the archive path above ([review])
- `spx session handoff` invents a value for `agent_session_id` when both environment variables are absent — the field is omitted, not populated with a placeholder ([review])
- Any command embeds session lineage (`previous_session_id`, `previous_result`) in the frontmatter — each session carries its own goal/next_step/result ([review])
- `spx session handoff` accepts caller-supplied `branch` or `worktree` values — both fields are sourced from git context regardless of frontmatter content ([review])
- `spx session handoff` parses caller-supplied stdin as YAML — input opening with the YAML-frontmatter delimiter is rejected with `SessionLegacyFrontmatterInputError` ([review])
