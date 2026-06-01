# Session Frontmatter

## Purpose

This decision governs the YAML frontmatter shape for every session file managed by `spx session` — what fields exist, when each is populated, what `spx session handoff` enforces, and how readers treat sessions whose frontmatter omits structured fields.

## Context

**Business impact:** Sessions are the durable record of agent work. A picking-up agent decides which session to resume by reading the frontmatter — without structured `goal` and `next_step` fields, that decision falls back to parsing free-form markdown bodies, which is slow, ambiguous, and frequently wrong. A session is forward-looking: `goal` declares why the session exists and `next_step` declares what to do first. The `archive/` directory holds sessions drained from the active queue; it is not consulted for outcomes.

**Technical constraints:** Sessions live in `.spx/sessions/{todo,doing,archive}/`. The directory is shared across worktrees per `spx/15-worktree-resolution.pdr.md` — the file lands at the Git common-dir product root, so one queue is visible from every worktree of the repository. A resuming agent reads a session from that shared queue and must be able to reach the commit the work was cut from without navigating to the working copy that produced it. The frontmatter is the only metadata channel the picker sees before opening the file.

## Decision

Every session file carries the frontmatter shape declared in this PDR. The shape has caller-supplied fields (`priority`, `goal`, `next_step`), fields prefilled from git and the system clock (`created_at`, `git_ref`, `agent_session_id`), and two optional auto-injection arrays (`specs`, `files`). The shape excludes `tags`, `working_directory`, and `worktree`. `spx session handoff` validates non-empty `goal` and `next_step`, prefills `git_ref` from git context, and permits a handoff only from a base a resuming agent can reach (see **Handoff base**). `spx session archive` moves a session file from `todo/` or `doing/` to `archive/` by rename, requiring only a resolvable session id and validating no frontmatter field. Sessions whose frontmatter omits structured fields remain readable through `list`, `show`, `pickup`, and `release` and are not re-emitted by handoff.

| Field              | Type     | Lifecycle                                                                                                                                                                     | Default                 | Validated by                                                                          |
| ------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| `created_at`       | string   | Prefilled by `spx session handoff` from system clock                                                                                                                          | -                       | `spx session handoff` (presence)                                                      |
| `agent_session_id` | string   | Prefilled by `spx session handoff` from `$CLAUDE_SESSION_ID` then `$CODEX_THREAD_ID`                                                                                          | absent when neither set | -                                                                                     |
| `priority`         | string   | Set by caller at handoff; defaults to `medium` when caller omits it                                                                                                           | `medium`                | `spx session handoff` (one of the `SESSION_PRIORITY` values: `high`, `medium`, `low`) |
| `git_ref`          | string   | Prefill-only by `spx session handoff` from git context: the checked-out branch name when HEAD is on a branch, the HEAD commit SHA when HEAD is detached; caller value ignored | -                       | `spx session handoff` (see **Handoff base**)                                          |
| `goal`             | string   | Provided by caller at handoff                                                                                                                                                 | -                       | `spx session handoff` (non-empty)                                                     |
| `next_step`        | string   | Provided by caller at handoff                                                                                                                                                 | -                       | `spx session handoff` (non-empty)                                                     |
| `specs`            | string[] | Optional list of file paths for auto-injection on pickup                                                                                                                      | `[]`                    | -                                                                                     |
| `files`            | string[] | Optional list of file paths for auto-injection on pickup                                                                                                                      | `[]`                    | -                                                                                     |

### Handoff base

`spx session handoff` sources `git_ref` from git context, never from caller input, and writes a session only when a resuming agent can reach the commit the work was cut from. Because the session queue is shared across worktrees, the base must be reachable without the working copy that produced the session. The default branch is resolved from git, never hardcoded.

- **Main checkout.** The session is created in the working tree at the Git common-dir product root — the checkout every worktree shares and the one a resuming agent lands in by default. Handoff is permitted here regardless of HEAD state, and `git_ref` records the checked-out branch name, or the HEAD commit SHA when HEAD is detached.
- **Linked worktree.** A linked worktree's branch is checked out only there and its uncommitted state does not travel with the shared session file. Handoff is permitted only when the working tree is clean and HEAD is detached at the tip of the default branch's remote-tracking ref `origin/<default>` — a commit any worktree can reach — and `git_ref` records that commit SHA. Otherwise handoff refuses with `SessionHandoffBaseError`, directing the agent to detach to `origin/<default>` with a clean working tree or to run handoff from the main checkout.

`spx session handoff` accepts caller-supplied structured fields as a JSON object at the start of stdin, followed by the body as the remaining bytes verbatim. A single `LF` or `CRLF` immediately after the JSON object's closing brace is consumed as a separator and is not part of the body. The on-disk frontmatter format remains YAML. Input opening with the YAML-frontmatter delimiter is rejected with `SessionLegacyFrontmatterInputError`.

## Rationale

Goal and next_step form the forward-looking handoff: the handing-off agent declares why this session exists (`goal`) and what to do first (`next_step`). A session declares the work to come; the resuming agent reads `goal` and `next_step` and continues. The `archive/` directory holds sessions drained from the active queue and is not consulted for outcomes, so the shape carries no recorded-result field. Archive is an unconditional move by rename — any session in `todo/` or `doing/` moves to `archive/` regardless of its frontmatter — so no session is ever stranded in the active queue.

The session queue is shared across worktrees per `spx/15-worktree-resolution.pdr.md`: `.spx/sessions/` lives at the Git common-dir root so every worktree sees the same queue. A resuming agent — possibly in a different working copy than the one that produced the session — reads the queue and acts on `goal` and `next_step`. The session records no working copy, so no command sends the agent navigating across the filesystem to a worktree; the handoff base is instead constrained to a commit the agent can already reach.

`git_ref` records the work's starting point from git context. In the main checkout — the shared working copy a resuming agent lands in — handoff records the checked-out branch, or the HEAD commit SHA when HEAD is detached. A linked worktree's branch and uncommitted state are local to that checkout and cannot be reconstructed from the shared session file, so handoff there is permitted only from a clean checkout detached at the default branch's tip, and `git_ref` records that commit's SHA. The SHA is recorded rather than the default branch name because no work happens on the default branch — naming it would describe a branch the session never sits on, while the SHA is precise and derives directly from the detached HEAD. The default branch is resolved from git so the rule holds for products whose default branch is not `main`.

Empty piped content is rejected at handoff. Substituting a default body for empty content satisfies the directory and filename contract but produces a session that carries no handoff information; rejecting empty content prevents that failure mode. The agent has the goal and next_step at the moment of handoff; requiring them costs nothing. `created_at` and `agent_session_id` are prefilled because the agent does not know them; everything else the agent does know.

Tags, working_directory, and worktree are absent from the shape. The structured fields above serve every coordination use case tags would carry. A recorded working copy — whether spelled `working_directory` or `worktree` — would invite a resuming agent to navigate to a checkout that may not exist in its environment, and the shared queue cannot guarantee any particular worktree is present; constraining the handoff base to a reachable commit removes the need to record one.

The auto-injection arrays (`specs`, `files`) default to `[]` rather than `undefined` so consumers iterate uniformly. Auto-injection itself is governed by `spx/36-session.enabler/21-auto-injection.adr.md`.

JSON is the input wire format because every caller-supplied string scalar is unambiguously quoted by definition — there is no plain-scalar mode, no comment syntax, and no leading-character ambiguity. The optional separator accepts both `LF` and `CRLF` because shell pipelines on different platforms can normalize line endings before stdin reaches the CLI. The on-disk format remains YAML so markdown-aware tools fold the frontmatter on render. The wire format is the format in which agents construct input; the on-disk format is the format in which humans and tools read sessions; the two need not be the same.

Alternatives considered:

- **Keep the priority+tags+created_at shape; add branch/goal/next_step as optional fields**: Optional structured fields rot. Without enforcement, sessions land with empty goals and the picker is back to reading the body. Required-at-write is the only durable contract.
- **Retain a `result` field for completed-work history**: A session is forward-looking; the resuming agent acts on `goal` and `next_step`. No reader consults a recorded `result`, and requiring one before archive strands abandoned sessions in the active queue with no command able to satisfy the check. Archive is queue cleanup, not a completed-work log.
- **Record the working copy the session was cut from (a `worktree` path)**: A recorded working copy invites a resuming agent to navigate to a checkout that may not exist in its environment, and the shared queue cannot guarantee any particular worktree is present. Constraining the handoff base to the main checkout or a commit on `origin/<default>` makes the base reachable without naming a working copy.
- **Record the default branch name in a detached-base session's `git_ref`**: Names a branch the session never sits on. The base commit SHA carries the same reachability guarantee while naming the exact commit.
- **Allow a linked-worktree handoff on any branch or a dirty tree**: A worktree-local branch cannot be checked out elsewhere and a dirty tree cannot be reconstructed from the shared session file, so the resuming agent cannot reach the session's base. Requiring a clean checkout detached at the default branch keeps the base portable.

## Trade-offs accepted

| Trade-off                                                                                      | Mitigation / reasoning                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handoff requires git context to prefill `git_ref`                                              | `spx session handoff` already resolves the Git common-dir per `spx/15-worktree-resolution.pdr.md`; the same context gives the branch                                                    |
| A linked-worktree handoff requires detaching to `origin/<default>` and cleaning the tree first | The session's base must be a commit the resuming agent can reach from the shared queue; a worktree-local branch or dirty tree is not reproducible, so the friction buys a portable base |
| Sessions whose frontmatter lacks structured fields render with empty values                    | Read tolerance keeps those sessions visible without weakening the write contract; sessions handoff produces under this PDR render in full                                               |
| Caller-supplied `goal` and `next_step` validation is more friction than a content check        | A single non-empty-body check accepts sessions with no handoff payload; the per-field validation buys a structured resume                                                               |

## Product invariants

- `spx session list` shows the goal and next_step of every session this PDR governs — the agent picking a session reads the work to do without opening the file
- `spx session archive` moves any session from `todo/` or `doing/` to `archive/` by rename, requiring only a resolvable session id — no frontmatter field gates the move, so no session is ever stranded in the active queue
- `spx session handoff` writes a session only from the main checkout or from a clean checkout detached at the tip of `origin/<default>` — the session's base is always a commit a resuming agent can reach from the shared queue
- `spx session handoff` records no working copy — a resuming agent acts on `goal` and `next_step` from the shared queue and never navigates to a worktree to resume a session
- A session whose frontmatter omits structured fields remains readable by every command — pickup, show, list, release tolerate missing structured fields and render them as empty
- `spx session handoff` preserves every caller-supplied string field exactly — values containing any unicode codepoint round-trip identically from caller input to the parsed metadata of the written session file
- `spx session handoff` rejects input opening with the YAML-frontmatter delimiter with a discoverable error — agents that emit the legacy shape receive a clear signal rather than silently truncated content

## Compliance

### Recognized by

A session file written by `spx session handoff` contains a YAML frontmatter with `priority`, `git_ref`, `goal`, `next_step` keys, where `goal` and `next_step` are non-empty strings and `git_ref` is the checked-out branch name or a commit SHA. `spx session archive` moves any session to `archive/` regardless of its frontmatter.

### MUST

- `spx session handoff` rejects piped content that lacks a non-empty `goal` and a non-empty `next_step` — `goal` and `next_step` are the handoff payload ([review])
- `spx session handoff` in the main checkout prefills `git_ref` from `git rev-parse --abbrev-ref HEAD`, or from the HEAD commit SHA when HEAD is detached; the value is prefill-only and caller-supplied `git_ref` is ignored ([review])
- `spx session handoff` in a linked worktree refuses unless the working tree is clean and HEAD is detached at the tip of `origin/<default>`, exiting non-zero with `SessionHandoffBaseError` directing the agent to detach to `origin/<default>` with a clean working tree or run handoff from the main checkout; on success it records `git_ref` as that commit SHA ([review])
- `spx session handoff` resolves the default branch from git rather than a hardcoded name when enforcing the linked-worktree base ([review])
- `spx session handoff` prefills `created_at` as an ISO-8601 timestamp with timezone offset per `spx/36-session.enabler/21-timestamp-format.adr.md` ([review])
- `spx session handoff` prefills `agent_session_id` from `$CLAUDE_SESSION_ID` when set, falling back to `$CODEX_THREAD_ID` — when neither is set, the field is absent from the frontmatter ([review])
- `spx session archive` moves a session from `todo/` or `doing/` to `archive/` by rename for any resolvable session id, validating no frontmatter field ([review])
- `spx session list`, `spx session show`, `spx session pickup`, and `spx session release` render missing structured fields as empty strings without rejecting the session — read tolerance keeps sessions whose frontmatter omits structured fields usable ([review])
- `spx session handoff` writes every string-typed frontmatter field through YAML scalar quoting — `git_ref` (raw git output), `agent_session_id` (raw environment variable), `goal` and `next_step` (raw caller-supplied content), and `created_at` (formatted timestamp) all flow through the `yaml` package's `stringify` so values containing YAML-special characters (`:`, `{`, `}`, `#`, `|`, `\`, quotes, spaces, newlines) round-trip cleanly through `parseSessionMetadata` ([review])
- `spx session handoff` accepts caller-supplied structured fields as a JSON object at the start of stdin, consumes at most one immediately following `LF` or `CRLF` separator, and treats the bytes after that separator as the body verbatim — JSON quoting semantics preserve caller content without parse ambiguity ([review])

### NEVER

- `spx session handoff` substitutes a default body for empty piped content — empty handoffs are rejected with `SessionInvalidContentError` ([review])
- `spx session handoff` writes a `result`, `tags`, `working_directory`, or `worktree` key — the shape carries none of them; `goal` and `next_step` are the forward-looking payload, and the structured fields supersede tags and any recorded working copy ([review])
- `spx session archive` rejects a session for a missing or empty frontmatter field — archive is an unconditional move and gates on no field ([review])
- `spx session handoff` invents a value for `agent_session_id` when both environment variables are absent — the field is omitted, not populated with a placeholder ([review])
- Any command embeds session lineage (`previous_session_id`, `previous_result`) in the frontmatter — each session carries its own goal and next_step ([review])
- `spx session handoff` accepts a caller-supplied `git_ref` value — `git_ref` is sourced from git context regardless of frontmatter content ([review])
- `spx session handoff` parses caller-supplied stdin as YAML — input opening with the YAML-frontmatter delimiter is rejected with `SessionLegacyFrontmatterInputError` ([review])
