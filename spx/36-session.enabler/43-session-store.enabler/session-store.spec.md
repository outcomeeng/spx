---
id: 01a1f5af-2ce4-7a21-98f8-1d62c908834c
---

# Session Store

PROVIDES directory-backed CRUD primitives (list, show, create, delete, handoff) for session files
SO THAT session-claim, session-retention, and session-cli enablers
CAN enumerate, read, write, and remove sessions without reimplementing filesystem access or directory traversal

## Assertions

### Test.Scenario: handoff input

- [handoff-writes-todo-session](tests/session-store.scenario.l1.test.ts):
  - Given an empty sessions directory
  - When a JSON header with non-empty `goal` and `next_step` is piped at the start of stdin followed by a body
  - Then a session file appears in `todo/` with a timestamp ID, the on-disk filename matches the emitted `<HANDOFF_ID>` tag, and `priority`, `git_ref`, `goal`, `next_step` keys are present in its frontmatter
- [empty-stdin-rejected](tests/session-store.scenario.l1.test.ts):
  - Given empty or whitespace-only stdin to handoff
  - When handoff is invoked
  - Then no file is written and the command rejects with `SessionInvalidContentError` per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [empty-goal-rejected](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header with empty `goal` piped to handoff
  - When handoff is invoked
  - Then no file is written and the command rejects with `SessionInvalidGoalError` per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [empty-next-step-rejected](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header with empty `next_step` piped to handoff
  - When handoff is invoked
  - Then no file is written and the command rejects with `SessionInvalidNextStepError` per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [frontmatter-stdin-rejected](tests/session-store.scenario.l1.test.ts):
  - Given stdin opening with the YAML-frontmatter delimiter `---`
  - When handoff is invoked
  - Then no file is written and the command rejects with `SessionLegacyFrontmatterInputError` per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [invalid-json-header-rejected](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header whose bytes after the opening brace do not form a valid JSON object
  - When handoff is invoked
  - Then no file is written and the command rejects with `SessionInvalidJsonHeaderError` per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [goal-hash-preserved](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header with `goal` containing the character `#`
  - When handoff is invoked
  - Then the written session file's parsed `goal` equals the caller-supplied string in full
- [next-step-hash-preserved](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header with `next_step` containing the character `#`
  - When handoff is invoked
  - Then the written session file's parsed `next_step` equals the caller-supplied string in full
- [next-step-colon-preserved](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header with `next_step` containing an embedded colon
  - When handoff is invoked
  - Then the written session file's parsed `next_step` equals the caller-supplied string in full
- [specs-yaml-characters-preserved](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header with `specs` containing the YAML-significant characters `>`, `|`, and `{`
  - When handoff is invoked
  - Then the written session file's parsed `specs` equals the caller-supplied array in full

### Test.Scenario: handoff path entries

- [files-yaml-characters-preserved](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header with `files` containing the YAML-significant characters `>`, `|`, and `{`
  - When handoff is invoked
  - Then the written session file's parsed `files` equals the caller-supplied array in full
- [specs-empty-entry-preserved](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header with `specs` containing a single empty-string entry
  - When handoff is invoked
  - Then the written session file's parsed `specs` equals the caller-supplied single-element array in full
- [files-empty-entry-preserved](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header with `files` containing a single empty-string entry
  - When handoff is invoked
  - Then the written session file's parsed `files` equals the caller-supplied single-element array in full
- [specs-directory-rejected](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header whose `specs` lists a path that resolves to an existing directory under the handoff working directory
  - When handoff is invoked
  - Then no file is written and the command rejects with `SessionInjectionDirectoryError` naming that entry per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [specs-missing-path-accepted](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header whose `specs` lists a path that does not exist on disk
  - When handoff is invoked
  - Then the session is written and the entry is recorded unchanged — handoff rejects only an entry resolving to an existing directory per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [files-directory-rejected](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header whose `files` lists a path that resolves to an existing directory under the handoff working directory
  - When handoff is invoked
  - Then no file is written and the command rejects with `SessionInjectionDirectoryError` naming that entry per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [files-missing-path-accepted](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header whose `files` lists a path that does not exist on disk
  - When handoff is invoked
  - Then the session is written and the entry is recorded unchanged — handoff rejects only an entry resolving to an existing directory per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [gate-before-directory-check](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header whose `specs` lists a path that resolves to an existing directory while the git-context gate rejects the running worktree
  - When handoff is invoked
  - Then the command rejects with `SessionHandoffBaseError` and no file is written — the git-context gate governs whether handoff is permitted and runs before the directory-injection check per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [crlf-separator-consumed](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header followed by a `CRLF` separator and a body
  - When handoff is invoked
  - Then the body written to the session file begins after the separator with no leading carriage return per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)

### Test.Scenario: handoff base

- [main-checkout-branch-base](tests/session-store.scenario.l1.test.ts):
  - Given handoff is invoked in the main checkout on a branch
  - When the session file is created
  - Then `git_ref` is the branch reported by `git rev-parse --abbrev-ref HEAD` per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [main-checkout-detached-base](tests/session-store.scenario.l1.test.ts):
  - Given handoff is invoked in the main checkout with a detached HEAD
  - When the session file is created
  - Then `git_ref` is the HEAD commit SHA per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [non-main-tip-base](tests/session-store.scenario.l1.test.ts):
  - Given handoff is invoked in a non-main checkout with a clean working tree detached at the tip of `origin/<default>`
  - When the session file is created
  - Then `git_ref` is that base commit SHA per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [non-main-dirty-refused](tests/session-store.scenario.l1.test.ts):
  - Given handoff is invoked in a non-main checkout whose working tree is dirty while HEAD is detached at the tip of `origin/<default>`
  - When handoff is invoked
  - Then no file is written and the command rejects with `SessionHandoffBaseError` whose dirty-checkout remedy directs the agent to commit before handoff and stop proceeding while the checkout is dirty per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [non-main-off-tip-refused](tests/session-store.scenario.l1.test.ts):
  - Given handoff is invoked in a non-main checkout whose working tree is clean while HEAD is not detached at the tip of `origin/<default>` (e.g., HEAD on a worktree-local branch, or HEAD detached at another commit)
  - When handoff is invoked
  - Then no file is written and the command rejects with `SessionHandoffBaseError` directing the agent to detach to `origin/<default>` with a clean working tree or run handoff from the main checkout per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)

### Test.Scenario: handoff work branch

- [work-branch-recorded](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header carrying a `git_ref` work-branch ref that exists on `origin`
  - When handoff is invoked from a permitted base
  - Then the written session file's `git_ref` equals that work-branch ref rather than the base the command would otherwise derive per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [empty-ref-gate-base](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header carrying an empty-string `git_ref`
  - When handoff is invoked from a permitted base
  - Then the written session file's `git_ref` is the gate-derived base and no origin probe runs — an empty ref is treated as no ref supplied per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [unknown-work-branch-refused](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header carrying a `git_ref` work-branch ref that does not exist on `origin`
  - When handoff is invoked
  - Then no file is written and the command rejects with `SessionWorkBranchNotOnOriginError` per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [revision-expression-refused](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header carrying a `git_ref` that is a revision expression (e.g. `<branch>~1`) on a branch that exists on `origin`
  - When handoff is invoked
  - Then no file is written and the command rejects with `SessionWorkBranchNotOnOriginError` — only an exact remote-tracking branch is accepted per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [head-ref-refused](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header carrying a `git_ref` of `HEAD`
  - When handoff is invoked
  - Then no file is written and the command rejects with `SessionWorkBranchNotOnOriginError` — `origin/HEAD` is the symbolic default-branch pointer, not a work branch, per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [work-branch-keeps-gate](tests/session-store.scenario.l1.test.ts):
  - Given a JSON header carrying a `git_ref` work-branch ref that exists on `origin`
  - When handoff is invoked from a non-main checkout whose working tree is dirty or whose HEAD is not detached at the tip of `origin/<default>`
  - Then no file is written and the command rejects with `SessionHandoffBaseError` — the work-branch ref does not bypass the git-context gate per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)

### Test.Scenario: handoff metadata

- [created-at-format](tests/session-store.compliance.l1.test.ts):
  - Given handoff is invoked
  - When the session file is created
  - Then `created_at` matches `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/` per [spx/36-session.enabler/21-timestamp-format.adr.md](spx/36-session.enabler/21-timestamp-format.adr.md)
- [agent-session-id-single](tests/session-store.scenario.l1.test.ts):
  - Given exactly one of `CLAUDE_CODE_SESSION_ID`, `CODEX_THREAD_ID`, `ANTIGRAVITY_CONVERSATION_ID`, and `PI_SESSION_ID` is non-empty in the calling environment
  - When handoff creates the session file
  - Then `agent_session_id` is written to YAML front matter with that variable's value
- [agent-session-id-none-or-several](tests/session-store.scenario.l1.test.ts):
  - Given none, or two or more, of the four identity variables are non-empty in the calling environment
  - When handoff creates the session file
  - Then `agent_session_id` does not appear in YAML front matter

### Test.Scenario: list and show

- [list-groups-by-status](tests/session-store.scenario.l1.test.ts):
  - Given sessions of mixed priorities in doing and todo
  - When list is invoked without `--status`
  - Then doing sessions and todo sessions appear in separate groups and within each group sessions are ordered by descending priority then by ascending timestamp
- [list-archive-status](tests/session-store.scenario.l1.test.ts):
  - Given sessions in all directories
  - When list `--status archive` is invoked
  - Then only archived sessions are shown
- [todo-priority-order](tests/session-store.scenario.l2.test.ts):
  - Given sessions of mixed priorities in todo
  - When todo subcommand is invoked
  - Then sessions appear in descending priority order, ties broken by ascending timestamp
- [show-text-output](tests/session-store.scenario.l1.test.ts):
  - Given a session exists on disk
  - When show is invoked through `showCommand`
  - Then `priority`, `git_ref`, `goal`, `next_step`, and `agent_session_id` values appear in the printed output along with the session body
- [show-json-single-record](tests/session-store.scenario.l1.test.ts):
  - Given a single session exists on disk
  - When show is invoked through `showCommand` with JSON format
  - Then the output parses as that session's bare flat record — the same `id`, `status`, and frontmatter-field shape the JSON list emits, with `created_at` and `agent_session_id` present only when the frontmatter carries them — and carries no session body
- [show-json-several-records](tests/session-store.scenario.l1.test.ts):
  - Given several session ids on disk
  - When show is invoked through `showCommand` with JSON format
  - Then the output parses as a JSON array of those flat records in the order the ids were supplied, each carrying the same bare flat record shape — no session body, with `created_at` and `agent_session_id` present only when the frontmatter carries them
- [show-json-unresolved-id](tests/session-store.scenario.l1.test.ts):
  - Given several session ids where at least one does not resolve
  - When show is invoked through `showCommand` with JSON format
  - Then every id is processed and the call rejects naming the unresolved id, emitting no record JSON
- [delete-removes-session](tests/session-store.scenario.l1.test.ts):
  - Given a session in any status directory
  - When delete is invoked through `deleteCommand`
  - Then the file is absent from every status directory after the call returns
- [missing-fields-rendered-empty](tests/session-store.scenario.l1.test.ts):
  - Given a session whose frontmatter omits structured fields (`git_ref`, `goal`, `next_step`)
  - When list, show, pickup, or release reads the session
  - Then the command renders the missing fields as empty strings and does not reject the session per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md)
- [list-json-flat-records](tests/session-store.scenario.l1.test.ts):
  - Given sessions in `todo` and `doing`
  - When list is invoked with JSON format and no field selection
  - Then the output parses as JSON keyed by status directory and each session is a flat record carrying `id`, `status`, `priority`, `git_ref`, `goal`, `next_step`, `specs`, and `files`, with `created_at` and `agent_session_id` present only when the session frontmatter carries them

### Test.Scenario: list projection and sort

- [list-field-selection](tests/session-store.scenario.l1.test.ts):
  - Given a field selection naming a subset of the session record fields
  - When list is invoked with JSON format
  - Then each session record in the parsed output contains exactly the selected fields in the requested order and no others
- [full-field-projection](tests/session-store.scenario.l1.test.ts):
  - Given a session carrying every record field
  - When its record is projected over the full field set
  - Then the projection equals the full record with the same keys in the same order
- [invalid-field-selection-rejected](tests/session-store.scenario.l1.test.ts):
  - Given a field selection that names no valid field — a token outside the session record field set, or a value naming no field at all (empty or only separators)
  - When list is invoked with JSON format
  - Then no output is produced and the command rejects with an error naming the offending value and listing the valid field set
- [field-selection-implies-json](tests/session-store.scenario.l1.test.ts):
  - Given a field selection
  - When list is invoked without an explicit JSON format flag
  - Then the output is the JSON projection — a field selection implies JSON output
- [sort-newest-first](tests/session-store.scenario.l1.test.ts):
  - Given sessions with valid IDs at the same priority
  - When `sortSessions` sorts them
  - Then the output orders them by newest timestamp first
- [sort-valid-before-unparsable](tests/session-store.scenario.l1.test.ts):
  - Given sessions with one valid ID and one unparsable ID at the same priority
  - When `sortSessions` sorts them
  - Then the valid-ID session appears before the unparsable-ID session
- [sort-unparsable-kept](tests/session-store.scenario.l1.test.ts):
  - Given sessions with unparsable IDs at the same priority
  - When `sortSessions` sorts them
  - Then the output contains the same session IDs as the input

### Test.Property: handoff

- [handoff-metadata-round-trip](tests/session-store.property.l1.test.ts): For every JSON header with arbitrary unicode-string values for `priority` (drawn from the SESSION_PRIORITY enum), `goal`, `next_step`, and arbitrary unicode-string arrays for `specs` and `files`, the parsed metadata of the written session file equals the caller-supplied values exactly per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md).
- [handoff-git-ref-resolution](tests/handoff-base-gate.property.l1.test.ts): For every `HandoffGitFacts`, `resolveHandoffGitRef` records the reachable base — the branch or HEAD on a main checkout, the origin tip on a clean non-main checkout detached at that tip — or refuses: silently with no checklist for a non-git base, with a diagnostic and no checklist for a main checkout with no reachable HEAD, and otherwise with a two-prerequisite checklist marking the clean and detached-at-tip prerequisites met or unmet — each with its remedy — and carrying the input git facts per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md).

### Test.Compliance: session files

- [created-at-iso-8601](tests/session-store.compliance.l1.test.ts): ALWAYS: `created_at` is written in ISO-8601 format with timezone offset per [spx/36-session.enabler/21-timestamp-format.adr.md](spx/36-session.enabler/21-timestamp-format.adr.md).
- [frontmatter-key-constants](tests/session-store.compliance.l1.test.ts): ALWAYS: every frontmatter key declared by [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md) is read and written through `SESSION_FRONT_MATTER` constants — no string literal name appears at any call site per [spx/36-session.enabler/37-frontmatter-key-enforcement.adr.md](spx/36-session.enabler/37-frontmatter-key-enforcement.adr.md).
- [declared-keys-only](tests/session-store.compliance.l1.test.ts): NEVER: handoff writes a frontmatter key outside the declared shape — only the keys declared by [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md) are written.
- [no-yaml-stdin](tests/session-store.compliance.l1.test.ts): NEVER: handoff parses caller-supplied stdin as YAML — input opening with the YAML-frontmatter delimiter is rejected with `SessionLegacyFrontmatterInputError` per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md).
- [non-main-base-refused](tests/session-store.scenario.l1.test.ts): NEVER: handoff writes a session from a non-main checkout whose working tree is dirty or whose HEAD is not detached at the tip of `origin/<default>` — handoff rejects with `SessionHandoffBaseError` per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md).
- [work-branch-on-origin-only](tests/session-store.scenario.l1.test.ts): NEVER: handoff records a caller-supplied `git_ref` work-branch ref absent from `origin` — handoff rejects with `SessionWorkBranchNotOnOriginError` per [spx/36-session.enabler/11-session-frontmatter.pdr.md](spx/36-session.enabler/11-session-frontmatter.pdr.md).
- [no-absolute-paths](tests/session-store.compliance.l1.test.ts): NEVER: the JSON list output exposes an absolute filesystem path for any session — a session is addressed by its `id`.

### Audit: session files

- path-components-from-config: ALWAYS: every path component is derived from `DEFAULT_CONFIG` per [spx/36-session.enabler/21-directory-structure.adr.md](spx/36-session.enabler/21-directory-structure.adr.md).
- no-hardcoded-statuses: NEVER: hardcode status strings (`"todo"`, `"doing"`, `"archive"`) outside of `SESSION_STATUSES` and `DEFAULT_CONFIG` per [spx/36-session.enabler/21-directory-structure.adr.md](spx/36-session.enabler/21-directory-structure.adr.md).
