# Session Frontmatter

GOVERNS the metadata every session file `spx session` writes
SO THAT an agent choosing and resuming work from the session queue shared across worktrees per [spx/15-worktree-management.pdr.md](spx/15-worktree-management.pdr.md)
CAN RELY ON each session naming its goal, its next step and a base reachable from the shared queue, and on every session staying readable whatever metadata it omits

## Test.Mapping: metadata-fields

`spx session handoff` writes exactly these metadata fields, each with its type, its lifecycle and its default.

| Case             | Field              | Type     | Lifecycle                                                                                                                                                                                                                                                                        | Default                    |
| ---------------- | ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| created-at       | `created_at`       | string   | Prefilled by `spx session handoff` from the system clock                                                                                                                                                                                                                         | -                          |
| agent-session-id | `agent_session_id` | string   | Prefilled by `spx session handoff` with the session id agent identification yields under [spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md](spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md)                              | absent when it yields none |
| priority         | `priority`         | string   | Set by caller at handoff; defaults to `medium` when omitted; validated as one of the `SESSION_PRIORITY` values (`high`/`medium`/`low`)                                                                                                                                           | `medium`                   |
| git-ref          | `git_ref`          | string   | Git-derived base by default (checked-out branch name, HEAD SHA when detached, or the `origin/<default>` tip SHA for a permitted non-main checkout); a caller-supplied work-branch ref is recorded in its place once `spx session handoff` confirms the branch exists on `origin` | -                          |
| goal             | `goal`             | string   | Provided by caller at handoff; validated non-empty                                                                                                                                                                                                                               | -                          |
| next-step        | `next_step`        | string   | Provided by caller at handoff; validated non-empty                                                                                                                                                                                                                               | -                          |
| specs            | `specs`            | string[] | Optional file paths for auto-injection on pickup; a non-empty entry resolving to an existing directory is rejected at handoff                                                                                                                                                    | `[]`                       |
| files            | `files`            | string[] | Optional file paths for auto-injection on pickup; a non-empty entry resolving to an existing directory is rejected at handoff                                                                                                                                                    | `[]`                       |

## Test.Compliance: handoff payload

- required-goal-next-step: ALWAYS: `spx session handoff` rejects piped content lacking a non-empty `goal` and a non-empty `next_step`, which are the handoff payload.
- injection-directory-rejected: NEVER: `spx session handoff` records a non-empty `specs` or `files` entry that resolves to an existing directory; it writes no file and exits non-zero with `SessionInjectionDirectoryError` naming the entry, while an entry that does not exist on disk is accepted and an empty entry is recorded verbatim.
- header-then-body: ALWAYS: `spx session handoff` accepts caller-supplied structured fields before the body, consumes at most one immediately following line separator, and treats the remaining bytes as the body verbatim.
- no-default-body: NEVER: `spx session handoff` substitutes a default body for empty piped content; empty handoffs are rejected with `SessionInvalidContentError`.
- declared-keys-only: NEVER: `spx session handoff` writes a metadata key outside the field set of the metadata-fields Mapping.
- no-legacy-frontmatter-input: NEVER: `spx session handoff` parses caller-supplied stdin as session-file frontmatter; input opening with the frontmatter delimiter is rejected with `SessionLegacyFrontmatterInputError`.

## Test.Compliance: prefilled fields

- created-at-prefill: ALWAYS: `spx session handoff` prefills `created_at` as an ISO-8601 timestamp with timezone offset per [spx/36-session.enabler/21-timestamp-format.adr.md](spx/36-session.enabler/21-timestamp-format.adr.md).
- agent-session-id-prefill: ALWAYS: `spx session handoff` prefills `agent_session_id` with the session id agent identification yields under [spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md](spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md), and omits the field when it yields none, never inventing a placeholder.
- priority-default: ALWAYS: `spx session handoff` defaults `priority` to `medium` when the caller omits it and validates it as one of the `SESSION_PRIORITY` values (`high`, `medium`, `low`).

## Test.Compliance: handoff base

- main-checkout-base: ALWAYS: `spx session handoff` in the main checkout records the checked-out branch name, or the HEAD commit SHA when detached, as the session base, unless the caller supplies a work-branch ref the command has verified exists on `origin`.
- non-main-checkout-base: ALWAYS: `spx session handoff` in a non-main checkout refuses unless the working tree is clean and HEAD is detached at the tip of `origin/<default>`, exiting non-zero with the prerequisite checklist; on success it records that commit SHA as the session base, unless the caller supplies a work-branch ref the command has verified exists on `origin`.
- actual-default-branch: ALWAYS: `spx session handoff` enforces the non-main-checkout base against the repository's actual default-branch tip, whatever the default branch is named.
- work-branch-ref: ALWAYS: when the caller supplies a work-branch ref in the stdin JSON header, `spx session handoff` confirms the branch exists on `origin` as an exact remote-tracking ref, not a resolvable revision expression, and records that ref as `git_ref` in place of the base it would otherwise derive.
- no-revision-expression: NEVER: `spx session handoff` accepts a caller `git_ref` that resolves only as a revision expression (such as `main~1`, `main^{commit}` or a bare SHA) rather than an exact `origin` branch; it refuses with `SessionWorkBranchNotOnOriginError`.
- no-head-ref: NEVER: `spx session handoff` accepts a caller `git_ref` of `HEAD`, because `refs/remotes/origin/HEAD` is the symbolic default-branch pointer, not a work branch; it refuses with `SessionWorkBranchNotOnOriginError`.
- empty-ref-absent: ALWAYS: an absent or empty-string `git_ref` counts as no ref supplied; `spx session handoff` records the gate-derived base and runs no origin probe.
- unverified-ref-refused: NEVER: `spx session handoff` records a caller-supplied work-branch ref that does not exist on `origin`; it refuses the handoff with `SessionWorkBranchNotOnOriginError`.
- gate-not-bypassed: NEVER: a caller-supplied work-branch ref bypasses the git-context gate; a linked worktree that is not clean and detached at the `origin/<default>` tip is refused regardless of the ref.
- no-base-override: NEVER: `spx session handoff` lets caller metadata override the session base, except a work-branch ref the command has verified exists on `origin`.

## Test.Compliance: refusal diagnostic

- silent-success: ALWAYS: `spx session handoff` prints no base diagnostic on a permitted handoff; success emits only the session's `<HANDOFF_ID>` and `<SESSION_FILE>` tags.
- checklist-lines: ALWAYS: on a non-main-checkout refusal, the diagnostic renders one numbered checklist line per base prerequisite marked `[PASS]` or `[FAIL]`, shown only when at least one prerequisite is unmet, and omits no prerequisite.
- resolved-values: ALWAYS: the refusal checklist carries resolved git values (the resolved default branch, the `origin/<default>` tip commit SHA, the observed HEAD commit SHA, the current worktree path, and the main-checkout path), stating a value as unresolved when git cannot resolve it rather than fabricating a placeholder.
- unset-origin-head: ALWAYS: when `origin/HEAD` is unset so `origin/<default>` resolves to no commit, the checklist marks the detached-at-tip prerequisite unmet and states the default branch and its tip as unresolved, never a fabricated branch name, SHA, or the literal-text placeholder.
- dirty-headline: ALWAYS: when the working tree is dirty, the first diagnostic line states that the checkout is dirty and cannot hand off, and the clean-working-tree checklist line is `[FAIL]` with a remedy to commit the changes before handoff and stop proceeding while the checkout is dirty.
- line-remedies: ALWAYS: each unmet checklist line states its failure reason and a remedy: commit before handoff for an unclean tree; detach HEAD to the `origin/<default>` tip or run handoff from the main checkout when off-tip; run handoff from the main checkout when `origin/HEAD` is unset.
- no-hiding-remedy: NEVER: a refusal remedy tells the user to hide uncommitted work outside the shared session queue.
- dirty-no-main-alternative: NEVER: a dirty-checkout refusal offers running handoff from the main checkout as an alternative to committing the dirty checkout.
- no-literal-placeholder: NEVER: the refusal diagnostic renders the literal-text placeholder `origin/<default>` in place of a base ref that resolves to a commit.

## Test.Compliance: reading and archive

- unconditional-archive: ALWAYS: `spx session archive` moves a session from `todo/` or `doing/` to `archive/` by rename for any resolvable session id, validating no frontmatter field and rejecting none for a missing or empty field.
- list-shows-goal: ALWAYS: `spx session list` shows each session's `goal` and `next_step`, so an agent picks the work to resume without opening the file.
- lenient-reads: ALWAYS: `spx session list`, `show`, `pickup`, and `release` render missing structured fields as empty strings without rejecting the session.
- no-lineage: NEVER: a command embeds session lineage (`previous_session_id`, `previous_result`) in the metadata; each session carries its own `goal` and `next_step`.

## Test.Property: round-trip

- string-fields-verbatim: ALWAYS: `spx session handoff` preserves every string-typed metadata field exactly, including punctuation, quotes, whitespace, newlines and any unicode codepoint.
