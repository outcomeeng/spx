# Reviewing

PROVIDES local hermetic review execution for branch and pull request targets
SO THAT developers and agents running `spx review`
CAN obtain configured review findings without sharing mutable state with the invoking agent

## Assertions

### Compliance

- ALWAYS: review execution is governed by `spx.config.{toml,json,yaml}` through a registered review descriptor ([review])
- ALWAYS: branch and pull request review targets run in hermetically separated agent execution state ([review])
- ALWAYS: review findings are persisted so status commands can inspect the latest local review evidence ([review])
- NEVER: let reviewer agents mutate the invoking agent's conversation, runtime state, or worktree without an explicit reviewed output path ([review])
