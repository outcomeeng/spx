# Plan: Agent session resume

## Branch-scope alignment

`spx/46-agent.enabler/32-search.enabler` defines branch association for search as transcript branch metadata, same-product worktree checkout roots, or accepted transcript command evidence. `spx/46-agent.enabler/21-resume.enabler` defines `spx agent resume --branch <name>` as initial transcript branch metadata only.

Align `spx agent resume --branch <name>` with branch association in `spx/46-agent.enabler/21-resume.enabler`:

1. Update `spx/46-agent.enabler/21-resume.enabler/resume.md` so branch scope uses branch association rather than only initial recorded branch metadata.
2. Add resume scenario, mapping, and compliance coverage for same-product worktree-root association and accepted transcript command evidence, preserving top-level-session-only behavior.
3. Refactor the agent branch-association predicates into a shared source-owned module used by both search and resume so command forms, failure handling, and subagent exclusion do not drift.
4. Keep resume discovery bounded per `spx/46-agent.enabler/21-resume.enabler/21-agent-session-resume.adr.md`; if full-transcript command evidence is required, revise that decision before implementation.
