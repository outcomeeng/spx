# PLAN — compact

## Remaining — cross-repo coordination (external)

The deterministic re-anchoring path activates once the sibling `outcomeeng/plugins` PreCompact and PostCompact hooks call the new command path. An operator-held prompt updates `src/plugins/spec-tree/scripts/pre-compact.py` and `post-compact.py` (and the governing PDR `spx/21-spec-tree.enabler/76-sessions.enabler/21-compact-continuity.pdr.md` in that repo) from `spx session compact-stash` / `compact-resume` to `spx compact stash` / `compact resume`. The flags (`--session-id`, `--transcript`), the stdout JSON shape `{"active_node": "...", "has_foundation": true}`, exit codes, and the no-op-on-no-foundation behavior are unchanged.

End-to-end verification once both sides land and `spx` is rebuilt: claim a session, `/compact`, confirm `compact-stash-1.json` under `.spx/sessions/<id>/`, and that PostCompact re-emits the active node from `spx compact resume`'s stdout rather than the summary fallback.
