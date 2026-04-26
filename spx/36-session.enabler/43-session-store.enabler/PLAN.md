# PLAN: Tests and implementation for created_at / agent_session_id pre-fill

## Context

`session-store.md` now declares 5 new assertions for handoff scaffold pre-filling:

- `created_at` written to YAML front matter as ISO 8601 with timezone
- `agent_session_id` from `CLAUDE_SESSION_ID` (primary), `CODEX_THREAD_ID` (fallback), or omitted

The assertions reference `tests/session-store.unit.test.ts` — a legacy-named file that does not yet
contain tests for this behaviour. The implementation is also absent.

## Steps (in order)

### 1. Write canonical-named test files

Create two new test files:

- `tests/session-store.scenario.l1.test.ts` — tests for the 4 scenario assertions
  (created_at written, agent_session_id from CLAUDE_SESSION_ID, fallback to CODEX_THREAD_ID, absent)
- `tests/session-store.compliance.l1.test.ts` — test for the compliance assertion
  (created_at must be ISO 8601 with timezone offset per ADR 21-timestamp-format)

Invoke `/spec-tree:testing` then `/typescript:testing-typescript` for scaffolding.

### 2. Update assertion links in session-store.md

Replace the 5 new assertion links that point to `session-store.unit.test.ts` with links to the
canonical files created in step 1.

### 3. Rename legacy test files

- `session-store.unit.test.ts` → split into `session-store.scenario.l1.test.ts` (new or merged)
  and `session-store.mapping.l1.test.ts` (for the sorting property) as appropriate
- `session-store.integration.test.ts` → `session-store.scenario.l2.test.ts` (the todo command
  scenario requires real filesystem, so l2 is correct)

Route each existing test through the 5-stage router in `/spec-tree:testing` to confirm level
assignments before renaming.

### 4. Implement pre-fill in the command handler

In `src/commands/session/handoff.ts` (confirm path via grep):

- Resolve `agentSessionId`: `process.env.CLAUDE_SESSION_ID ?? process.env.CODEX_THREAD_ID`
- Pass `createdAt: new Date()` and optional `agentSessionId` to the store's handoff function
- Store function (`src/session/store.ts`) must accept these as parameters (pure — no process.env
  access per ADR 32-domain-command-split) and write them to YAML front matter

Run `pnpm run validate && pnpm test` after each file.

## Notes

- ADR `32-domain-command-split` governs the pure/IO split — store accepts parameters, CLI handler
  reads env
- ADR `21-timestamp-format` governs the `created_at` ISO 8601 format
- Remove this PLAN.md when all steps are complete
