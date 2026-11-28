---
id: 01a1ffbf-9424-7208-91fb-2149fc2b02d1
---

# Codex

PROVIDES the facts spx needs about the Codex coding agent: its hook payload's session field, its compact-stdout default, its methodology bundle, its agent home, its session store and transcript records, its process name, and its plugin and marketplace listings
SO THAT spx's agent-facing behavior
CAN read a Codex session from its hook payload and work with its configuration, transcripts, and plugins from this agent's module alone

## Audit: Codex agent module

- payload-session-field: ALWAYS: the Codex agent module declares `session_id` as the field of its hook payload that carries the session id, and a Codex session id is that field's value, normalized to the safe agent session token.
- compact-stdout-default: ALWAYS: the Codex agent module declares a compact-stdout default of false.
- methodology-bundle: ALWAYS: the Codex agent module declares the `codex` methodology bundle and does not mark it as the default.
- agent-home: ALWAYS: the Codex agent home is the directory `CODEX_HOME` names; without it, `.codex` in the person's home directory is user scope, which spx reads for diagnostics and session reading only and never writes.
- session-store: ALWAYS: the Codex session store is `sessions/` in the agent home, or in that user scope, holding JSONL transcripts.
- transcript-records: ALWAYS: a Codex transcript records its working directory and branch once in its opening `session_meta` row, and the Codex record reader accepts turn-context records carrying a plain-path working directory at `payload.cwd` and command-execution records carrying a file-URI working directory, decoded to a filesystem path.
- process-name: ALWAYS: the Codex agent module declares `codex` as its process name.
- plugin-listing: ALWAYS: the Codex agent module reads installed plugins from `codex plugin list --json`, an object whose `installed` array holds entries each carrying `name` and `enabled`.
- marketplace-listing: ALWAYS: the Codex agent module reads registered marketplaces from `codex plugin marketplace list --json`, an object whose `marketplaces` array holds entries each carrying `name`, `root`, and `marketplaceSource` with `sourceType` and `source`.
