# Search

PROVIDES product-scoped coding-agent session search over Codex and Claude Code agent-native transcript stores
SO THAT users and diagnostic surfaces operating in a product worktree
CAN find agent-native sessions by handoff pickup markers, literal transcript content, agent session id, branch, and agent kind without treating SPX handoff session files as agent sessions

## Assertions

### Scenarios

- Given Codex and Claude Code top-level transcripts under the current product scope and a transcript outside that scope, when `spx agent search --pickup-id <id>` runs, then only product-scoped top-level agent sessions whose transcript contains the exact pickup marker are returned ([test](tests/search.scenario.l1.test.ts))
- Given a matching search result, when `spx agent search --json` runs, then the JSON output exposes the agent kind, agent session id, current working directory, source transcript path, modification time, updated timestamp, branch, and match reasons for that result ([test](tests/search.scenario.l1.test.ts))

### Mappings

- `--pickup-id <id>` maps to an exact content search for `<PICKUP_ID><id></PICKUP_ID>`, `--contains <literal>` maps to a literal transcript content search, `--session-id <id>` maps to agent session metadata, `--branch <name>` maps to agent branch metadata, `--agent <kind>` maps to the selected agent adapter set, `--limit <n>` maps to the maximum result count, and `--all` maps to removal of the recent-session time bound ([test](tests/search.mapping.l1.test.ts))

### Compliance

- ALWAYS: Codex search reads from `CODEX_HOME` plus `sessions` when set or `~/.codex/sessions` otherwise, and Claude Code search reads from `CLAUDE_CONFIG_DIR` plus `projects` when set or `~/.claude/projects` otherwise ([test](tests/search.compliance.l1.test.ts))
- ALWAYS: default search is product-scoped, excludes agent subagent transcripts, bounds output by recent-session and result-count limits, and searches only agent-native transcript stores rather than `.spx/sessions/` SPX handoff session files ([test](tests/search.compliance.l1.test.ts))
