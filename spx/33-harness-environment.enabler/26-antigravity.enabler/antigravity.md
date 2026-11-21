---
id: 01a1ffbf-9424-7208-91fb-214a35f400de
---

# Antigravity

PROVIDES the facts spx needs about the Antigravity coding agent: its identity variable and session id, its compact-stdout default, its process name, its plugin listing, and the user scope spx reads but never writes
SO THAT spx's agent-facing behavior
CAN identify an Antigravity session and read its configuration and plugins from this agent's module alone

## Audit: Antigravity agent module

- identity-variable: ALWAYS: the Antigravity agent module declares `ANTIGRAVITY_CONVERSATION_ID` as its identity variable.
- session-id: ALWAYS: an Antigravity session id is the value of `ANTIGRAVITY_CONVERSATION_ID`, normalized to the safe agent session token.
- compact-stdout-default: ALWAYS: the Antigravity agent module declares a compact-stdout default of false.
- no-methodology-bundle: NEVER: the Antigravity agent module declares a methodology bundle.
- process-name: ALWAYS: the Antigravity agent module declares `agy` as its process name.
- plugin-listing: ALWAYS: the Antigravity agent module reads installed plugins from `agy plugin list --json`, an array of entries each carrying `name`, `enabled`, `version`, `source`, `path`, and `skills`, and declares no marketplace listing.
- user-scope-only: ALWAYS: spx sets no agent home for Antigravity; its configuration home `~/.gemini/antigravity-cli` and its plugins under `~/.gemini/config/plugins` are user scope, which spx reads for diagnostics only.
- no-installs: NEVER: agent configuration installs a marketplace, plugin, or skill for Antigravity.
- no-session-store: NEVER: the Antigravity agent module declares a session store, a record reader, or a resume launch.
