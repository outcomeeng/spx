# Session Frontmatter

GOVERNS the metadata every session file `spx session` writes and the base `spx session handoff` records
SO THAT an agent choosing and resuming work from the shared session queue
CAN RELY ON a non-empty goal and next step on every handed-off session, a base reachable from the shared queue or an explicit work branch confirmed on `origin`, and every session readable whatever structured fields it omits

## Verification

### Test.Mapping: session-metadata-fields

Each metadata field a session file carries takes its type, its lifecycle, and its default from this table, and no other key appears.

| Case             | Type     | Lifecycle                                                                                                                                                                                                                                                                        | Default                         |
| ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| created-at       | string   | Prefilled by `spx session handoff` from the system clock                                                                                                                                                                                                                         | -                               |
| agent-session-id | string   | Prefilled by `spx session handoff` from whichever of `$CLAUDE_CODE_SESSION_ID`, `$CODEX_THREAD_ID`, `$ANTIGRAVITY_CONVERSATION_ID`, and `$PI_SESSION_ID` is the only one non-empty                                                                                               | absent when none or several set |
| priority         | string   | Set by caller at handoff; defaults to `medium` when omitted; validated as one of the `SESSION_PRIORITY` values (`high`/`medium`/`low`)                                                                                                                                           | `medium`                        |
| git-ref          | string   | Git-derived base by default (checked-out branch name, HEAD SHA when detached, or the `origin/<default>` tip SHA for a permitted non-main checkout); a caller-supplied work-branch ref is recorded in its place once `spx session handoff` confirms the branch exists on `origin` | -                               |
| goal             | string   | Provided by caller at handoff; validated non-empty                                                                                                                                                                                                                               | -                               |
| next-step        | string   | Provided by caller at handoff; validated non-empty                                                                                                                                                                                                                               | -                               |
| specs            | string[] | Optional file paths for auto-injection on pickup; a non-empty entry resolving to an existing directory is rejected at handoff                                                                                                                                                    | `[]`                            |
| files            | string[] | Optional file paths for auto-injection on pickup; a non-empty entry resolving to an existing directory is rejected at handoff                                                                                                                                                    | `[]`                            |

### Test.Compliance: handoff content

- required-goal-next-step: ALWAYS: `spx session handoff` rejects piped content lacking a non-empty `goal` and a non-empty `next_step`, which are the handoff payload.
- directory-entry-rejected: ALWAYS: `spx session handoff` rejects a non-empty `specs` or `files` entry that resolves to an existing directory, writing no file and exiting non-zero with `SessionInjectionDirectoryError` naming the entry; an entry that does not exist on disk is accepted, since sessions outlive the files they reference, and an empty entry names no path and is recorded verbatim.
- no-directory-entry-recorded: NEVER: `spx session handoff` records a non-empty `specs` or `files` entry that resolves to an existing directory; the arrays are file paths and a directory carries no injectable content.
- fields-before-body: ALWAYS: `spx session handoff` accepts caller-supplied structured fields before the body, consumes at most one immediately following line separator, and treats the remaining bytes as the body verbatim.
- no-default-body: NEVER: `spx session handoff` substitutes a default body for empty piped content; empty handoffs are rejected with `SessionInvalidContentError`.
- no-frontmatter-input: NEVER: `spx session handoff` parses caller-supplied stdin as session-file frontmatter; input opening with the frontmatter delimiter is rejected with `SessionLegacyFrontmatterInputError`.
- declared-keys-only: NEVER: `spx session handoff` writes a metadata key outside the field set session-metadata-fields declares.
- no-session-lineage: NEVER: any command embeds session lineage (`previous_session_id`, `previous_result`) in the metadata; each session carries its own `goal` and `next_step`.

### Test.Compliance: handoff base

- main-checkout-base: ALWAYS: `spx session handoff` in the main checkout records the checked-out branch name, or the HEAD commit SHA when detached, as the session base, unless the caller supplies a work-branch ref the command has verified exists on `origin`; caller metadata otherwise cannot override that base.
- non-main-checkout-base: ALWAYS: `spx session handoff` in a non-main checkout refuses unless the working tree is clean and HEAD is detached at the tip of `origin/<default>`, exiting non-zero with the prerequisite checklist; on success it records that commit SHA as the session base, unless the caller supplies a work-branch ref the command has verified exists on `origin`.
- actual-default-branch: ALWAYS: `spx session handoff` enforces the non-main-checkout base against the repository's actual default-branch tip, whatever the default branch is named.
- verified-work-branch: ALWAYS: when the caller supplies a work-branch ref in the stdin JSON header, `spx session handoff` confirms the branch exists on `origin` as an exact remote-tracking ref, not a resolvable revision expression, and records that ref as `git_ref`, overriding the base it would otherwise derive.
- no-revision-expression-ref: NEVER: `spx session handoff` accepts a caller `git_ref` that resolves only as a revision expression (such as `main~1`, `main^{commit}`, or a bare SHA) rather than an exact `origin` branch; such a ref is refused with `SessionWorkBranchNotOnOriginError`.
- no-head-ref: NEVER: `spx session handoff` accepts a caller `git_ref` of `HEAD`; `refs/remotes/origin/HEAD` is the symbolic default-branch pointer, not a work branch, so it is refused with `SessionWorkBranchNotOnOriginError`.
- empty-ref-as-absent: ALWAYS: an absent or empty-string `git_ref` is treated as no ref supplied, so `spx session handoff` records the gate-derived base and runs no origin probe.
- unknown-work-branch-refused: NEVER: `spx session handoff` records a caller-supplied work-branch ref that does not exist on `origin`; it refuses the handoff with `SessionWorkBranchNotOnOriginError`.
- ref-keeps-gate: NEVER: a caller-supplied work-branch ref bypasses the git-context gate; a linked worktree that is not clean and detached at the `origin/<default>` tip is refused regardless of the ref.
- no-base-override: NEVER: `spx session handoff` lets caller metadata override the session base, except a work-branch ref the command has verified exists on `origin`.

### Test.Compliance: refusal diagnostic

- silent-success: ALWAYS: `spx session handoff` prints no base diagnostic on a permitted handoff; success emits only the session's `<HANDOFF_ID>` and `<SESSION_FILE>` tags.
- numbered-checklist: ALWAYS: on a non-main-checkout refusal, the diagnostic renders one numbered checklist line per base prerequisite marked `[PASS]` or `[FAIL]`, shown only when at least one prerequisite is unmet.
- resolved-git-values: ALWAYS: the handoff refusal checklist carries resolved git values (the resolved default branch, the `origin/<default>` tip commit SHA, the observed HEAD commit SHA, the current worktree path, and the main-checkout path), stating a value as unresolved when git cannot resolve it rather than fabricating a placeholder, in a layout of the renderer's choice.
- unset-origin-head: ALWAYS: when `origin/HEAD` is unset so `origin/<default>` resolves to no commit, the checklist marks the detached-at-tip prerequisite unmet and states the default branch and its `origin/<default>` tip as unresolved rather than a fabricated branch name, SHA, or the literal-text placeholder.
- dirty-checkout-headline: ALWAYS: when the working tree is dirty, the first diagnostic line states that the checkout is dirty and cannot hand off, and the clean-working-tree checklist line is `[FAIL]` with a remedy to commit the changes before handoff and stop proceeding while the checkout is dirty.
- failure-remedies: ALWAYS: each unmet checklist line states its failure reason and a remedy: the unclean-tree remedy is to commit the changes before handoff and stop proceeding while the checkout is dirty, the off-tip remedy is to detach HEAD to the `origin/<default>` tip or run handoff from the main checkout, and the unresolved-base remedy (when `origin/HEAD` is unset) is to run handoff from the main checkout.
- no-hidden-work-remedy: NEVER: the handoff refusal remedy tells the user to hide uncommitted work outside the shared session queue; remedies are to commit the work, detach to the default-branch tip, or run handoff from the main checkout only for non-dirty off-tip or unresolved-base failures.
- dirty-no-main-alternative: NEVER: a dirty-checkout refusal offers running handoff from the main checkout as an alternative to committing the dirty checkout; dirty work must be made visible before handoff proceeds.
- no-literal-placeholder: NEVER: the handoff refusal diagnostic renders the literal-text placeholder `origin/<default>` in place of a base ref that resolves to a commit; a resolvable ref is shown by its value, an unresolvable one is stated as unresolved.
- every-prerequisite-listed: NEVER: the handoff refusal checklist omits any base prerequisite; every prerequisite appears on its own numbered line with a `[PASS]` or `[FAIL]` marker.

### Test.Compliance: metadata prefill

- created-at-format: ALWAYS: `spx session handoff` prefills `created_at` as an ISO-8601 timestamp with timezone offset per [spx/36-session.enabler/21-timestamp-format.adr.md](spx/36-session.enabler/21-timestamp-format.adr.md).
- agent-session-id-prefill: ALWAYS: `spx session handoff` prefills `agent_session_id` from whichever of `$CLAUDE_CODE_SESSION_ID`, `$CODEX_THREAD_ID`, `$ANTIGRAVITY_CONVERSATION_ID`, and `$PI_SESSION_ID` is the only one non-empty; when none or two or more are non-empty the field is absent, and `$CLAUDE_SESSION_ID` is never read.
- priority-default: ALWAYS: `spx session handoff` defaults `priority` to `medium` when the caller omits it and validates it as one of the `SESSION_PRIORITY` values (`high`, `medium`, `low`).
- no-invented-session-id: NEVER: `spx session handoff` invents a value for `agent_session_id` or chooses one of several non-empty identity variables; the field is omitted, not populated with a placeholder or a chosen variable's value.

### Test.Compliance: read and archive

- unconditional-archive: ALWAYS: `spx session archive` moves a session from `todo/` or `doing/` to `archive/` by rename for any resolvable session id, validating no frontmatter field.
- empty-field-rendering: ALWAYS: `spx session list`, `show`, `pickup`, and `release` render missing structured fields as empty strings without rejecting the session.
- no-archive-field-gate: NEVER: `spx session archive` rejects a session for a missing or empty metadata field; archive is an unconditional move.

### Test.Property: metadata strings

- string-fields-round-trip: `spx session handoff` preserves every string-typed metadata field exactly, including punctuation, quotes, whitespace, and newlines.
