# Plan: Agent Run Journal downstream work

The event-store contract in `21-event-sourced-journal.adr.md` governs how agentic verdict-mode runs are stored. It names no backend; realizing it proceeds in sequence:

1. **Adapters** — a local Appendable adapter inside `spx/18-state.enabler` (over its `43-record-store.enabler` mechanics) and a GitHub adapter (Actions artifact, Actions cache, PR comment) in the GitHub/CI integration node. Each adapter node declares the concrete backend it binds and tests that it is exactly one kind, Appendable or Snapshot.
2. **Audit** — `spx/36-audit.enabler/54-branch-run-state.enabler` and `spx/36-audit.enabler/15-audit-directory.adr.md` are authored against the journal interface so audit runs persist as event journals.
3. **Review** — `spx/46-reviewing.enabler/43-review-state.enabler` and `spx/46-reviewing.enabler/15-review-directory.adr.md` are authored against the journal interface so review runs persist as event journals.

Each step lands as its own change, where the spec is authored against a working adapter.
