# Local State Store

spx stores local execution state under composable `.spx/` scopes: changeset state under `.spx/branch/{branch-slug}/`, repository-shared change state under `.spx/changes/`, checkout-local state under `.spx/worktree/`, and narrower agent-session state inside the broader validity scope such as `.spx/worktree/{session-token}/compact/stash.jsonl`. Machine-owned records are line-delimited JSON histories so commands can append observations and recover the latest complete record. User-facing session files remain Markdown at `.spx/sessions/{todo,doing,archive}/{timestamp-token}.md`.

## Rationale

State validity is scoped by the facts that must still match when a later command reads it. Branch-scoped state follows a reviewable changeset across worktrees, repository-shared change state coordinates change records across the repository, worktree-scoped state depends on uncommitted files in one checkout, and session-scoped state isolates repeated or concurrent agent conversations inside the broader scope. Keeping narrower isolation inside the broader validity boundary keeps cleanup and lookup local to the strongest fact that makes the state meaningful.

Line-delimited JSON is the default store format because local execution state is history-shaped: each line can be appended, parsed independently, and ignored independently when partial writes or malformed records appear. Markdown remains valid when the artifact is meant for direct user reading or editing, as with session files. Single-artifact run histories remain shallow, while multi-artifact runs keep their siblings grouped.

## Product properties

- Shared repository state lives under `.spx/branch/{branch-slug}/` for reviewable changeset observations and `.spx/changes/` for repository-wide change records, visible from every worktree whose validity scope matches the stored artifact.
- Worktree-scoped state lives under `.spx/worktree/` and is private to the checkout whose dirty files produced the observation.
- Session-scoped state composes inside the broader branch or worktree state whose validity it refines, including compact stash records at `.spx/worktree/{session-token}/compact/stash.jsonl`.

## Verification

### Testing

- ALWAYS: main and non-main worktrees share `.spx/branch/{branch-slug}/` observations and keep `.spx/worktree/` observations separate ([mapping])
- ALWAYS: main and non-main worktrees share `.spx/changes/` observations ([mapping])
- ALWAYS: a single-artifact run is represented as `runs/run-{run-token}.jsonl` rather than a directory of sibling artifacts ([property])
- ALWAYS: compact records for agent-session tokens in one worktree use separate `.spx/worktree/{session-token}/compact/stash.jsonl` paths ([property])

### Audit

- ALWAYS: include only the scope facts required for state validity; a changeset artifact does not add a worktree scope unless dirty checkout state participates ([audit])
- ALWAYS: compose narrower isolation inside the broader validity scope ([audit])
- ALWAYS: store repository-shared change state under `.spx/changes/` rather than branch-scoped or worktree-scoped state ([audit])
- ALWAYS: use line-delimited JSON for machine-owned store records unless the artifact is a single structured document that requires whole-document replacement ([audit])
- ALWAYS: use Markdown for session files and other artifacts meant for direct user reading or editing, including `.spx/sessions/{todo,doing,archive}/{timestamp-token}.md` ([audit])
- NEVER: make session identity the outer validity boundary for state whose meaning depends on a branch or worktree ([audit])
- NEVER: store changeset-scoped state as worktree-scoped state or dirty-checkout state as branch-scoped state ([audit])
