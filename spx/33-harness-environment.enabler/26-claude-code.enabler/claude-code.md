---
id: 01a1ffbf-9424-7208-91fb-2148c14bbb65
---

# Claude Code

PROVIDES the facts spx needs about the Claude Code coding agent: its identity variable and session id, its compact-stdout default, its methodology bundle, its agent home, its session store and transcript records, its process name, and its plugin and marketplace listings
SO THAT spx's agent-facing behavior
CAN identify a Claude Code session and work with its configuration, transcripts, and plugins from this agent's module alone

## Audit: Claude Code agent module

- identity-variable: ALWAYS: the Claude Code agent module declares `CLAUDE_CODE_SESSION_ID`, the variable Claude Code exports to every process it runs, as its identity variable.
- session-id: ALWAYS: a Claude Code session id is the value of `CLAUDE_CODE_SESSION_ID`, normalized to the safe agent session token.
- compact-stdout-default: ALWAYS: the Claude Code agent module declares a compact-stdout default of true.
- methodology-bundle: ALWAYS: the Claude Code agent module declares the `claude` methodology bundle and marks it as the default methodology bundle.
- agent-home: ALWAYS: the Claude Code agent home is the directory `CLAUDE_CONFIG_DIR` names; without it, `.claude` in the person's home directory is user scope, which spx reads for diagnostics and session reading only and never writes.
- session-store: ALWAYS: the Claude Code session store is the per-project directories under `projects/` in the agent home, or in that user scope, each holding JSONL transcripts.
- transcript-records: ALWAYS: a Claude Code transcript lives in a project directory of the session store whose name encodes the working directory, and each of its rows repeats the branch.
- process-name: ALWAYS: the Claude Code agent module declares `claude` as its process name.
- plugin-listing: ALWAYS: the Claude Code agent module reads installed plugins from `claude plugin list --json`, an array of entries each carrying `id` as `name@marketplace` and `enabled`.
- marketplace-listing: ALWAYS: the Claude Code agent module reads registered marketplaces from `claude plugin marketplace list --json`, an array of entries each carrying `name`, `source`, `url`, and `installLocation`.
