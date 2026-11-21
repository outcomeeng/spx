---
id: 01a1ffbf-9424-7208-91fb-2148c14bbb65
---

# Claude Code

PROVIDES the facts spx needs about the Claude Code coding agent: its identity variable and session id, its compact-stdout default, its methodology bundle, its configuration home, its transcript records, its process name, and its plugin and marketplace listings
SO THAT spx's agent-facing behavior
CAN identify a Claude Code session and work with its configuration, transcripts, and plugins from this agent's module alone

## Audit: Claude Code agent module

- identity-variable: ALWAYS: the Claude Code agent module declares `CLAUDE_CODE_SESSION_ID`, the variable Claude Code exports to every process it runs, as its identity variable.
- session-id: ALWAYS: a Claude Code session id is the value of `CLAUDE_CODE_SESSION_ID`, normalized to the safe agent session token.
- compact-stdout-default: ALWAYS: the Claude Code agent module declares a compact-stdout default of true.
- methodology-bundle: ALWAYS: the Claude Code agent module declares the `claude` methodology bundle and marks it as the default methodology bundle.
- config-home: ALWAYS: the Claude Code configuration home is the directory `CLAUDE_CONFIG_DIR` names, else `.claude` in the person's home directory.
- transcript-records: ALWAYS: a Claude Code transcript lives in a project directory under the configuration home whose name encodes the working directory, and each of its rows repeats the branch.
- process-name: ALWAYS: the Claude Code agent module declares `claude` as its process name.
- plugin-listing: ALWAYS: the Claude Code agent module reads installed plugins from `claude plugin list --json`, an array of entries each carrying `id` as `name@marketplace` and `enabled`.
- marketplace-listing: ALWAYS: the Claude Code agent module reads registered marketplaces from `claude plugin marketplace list --json`, an array of entries each carrying `name`, `source`, `url`, and `installLocation`.
