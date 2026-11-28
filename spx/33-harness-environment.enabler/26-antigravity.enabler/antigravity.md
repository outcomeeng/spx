---
id: 01a1ffbf-9424-7208-91fb-214a35f400de
---

# Antigravity

PROVIDES the facts spx needs about the Antigravity coding agent: its hook payload's session field, its compact-stdout default, its process name, its plugin listing, and the user scope spx reads but never writes
SO THAT spx's agent-facing behavior
CAN read an Antigravity session from its hook payload and read its configuration and plugins from this agent's module alone

## Audit: Antigravity agent module

- payload-session-field: ALWAYS: the Antigravity agent module declares `conversationId` as the field of its hook payload that carries the session id, and an Antigravity session id is that field's value, normalized to the safe agent session token.
- compact-stdout-default: ALWAYS: the Antigravity agent module declares a compact-stdout default of false.
- no-methodology-bundle: NEVER: the Antigravity agent module declares a methodology bundle.
- process-name: ALWAYS: the Antigravity agent module declares `agy` as its process name.
- plugin-listing: ALWAYS: the Antigravity agent module reads installed plugins from `agy plugin list --json`, an array of entries each carrying `name`, `enabled`, `version`, `source`, `path`, and `skills`, and declares no marketplace listing.
- user-scope-only: ALWAYS: spx sets no agent home for Antigravity; its configuration home `~/.gemini/antigravity-cli` and its plugins under `~/.gemini/config/plugins` are user scope, which spx reads for diagnostics only.
- no-installs: NEVER: agent configuration installs a marketplace, plugin, or skill for Antigravity.
- no-session-store: NEVER: the Antigravity agent module declares a session store, a record reader, or a resume launch.
