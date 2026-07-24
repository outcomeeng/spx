# Search

PROVIDES coding-agent session search over Codex, Claude Code, and Pi agent-native transcript stores
SO THAT users and diagnostic surfaces operating in a product worktree
CAN find agent-native sessions by handoff pickup markers, literal transcript content, agent session id, branch association, and agent kind without treating SPX handoff session files as agent sessions

## Assertions

### Scenarios

- Given `spx agent search` runs in a worktree of a bare-repository pool, when the default search scope resolves, then the Git common-dir product root is returned rather than the local worktree root, per `spx/15-worktree-management.pdr.md` ([test](tests/search.scenario.l1.test.ts))
- Given Codex and Claude Code top-level transcripts and versioned Pi top-level transcripts under the current product scope, plus a transcript outside that scope, when `spx agent search --pickup-id <id>` runs, then only product-scoped top-level agent sessions whose transcript contains the exact pickup marker are returned ([test](tests/search.scenario.l1.test.ts))
- Given a matching search result, when `spx agent search --json` runs, then the JSON output exposes the agent kind, agent session id, current working directory, source transcript path, modification time, updated timestamp, branch, and match reasons for that result ([test](tests/search.scenario.l1.test.ts))
- Given a top-level agent session whose transcript branch metadata records the requested branch inside the invocation product scope and another session records the requested branch outside that scope, when `spx agent search --branch <name> --json` runs, then only the product-scoped session is returned with its recorded current working directory and `branch` in its match reasons ([test](tests/search.scenario.l1.test.ts))
- Given a top-level Codex, Claude Code, or Pi session whose current working directory is inside a same-product worktree checked out on the requested branch while its transcript branch metadata records another branch or no branch, when `spx agent search --branch <name> --json` runs, then the session is returned with `branch` in its match reasons ([test](tests/search.scenario.l1.test.ts))
- Given a Codex subagent transcript whose parent top-level session exists and whose branch metadata names the requested branch, when `spx agent search --branch <name> --json` runs, then the parent top-level session is returned with the branch-evidence current working directory, `branch` in its match reasons, and the subagent transcript is not returned as its own row ([test](tests/search.scenario.l1.test.ts))

### Mappings

- `--pickup-id <id>` maps to an exact content search for `<PICKUP_ID><id></PICKUP_ID>`, `--contains <literal>` maps to a literal transcript content search, `--session-id <id>` maps to agent session metadata, `--branch <name>` maps to branch association from transcript branch metadata across agent-native stores, same-product worktree checkout roots, accepted transcript command evidence, and Codex subagent transcript branch evidence attributed to the parent top-level session, `--agent <kind>` maps to the selected agent adapter set, `--limit <n>` maps to the maximum result count, and `--all` maps to removal of the recent-session time bound ([test](tests/search.mapping.l1.test.ts))

### Compliance

- ALWAYS: Codex search reads from `CODEX_HOME` plus `sessions` when set or `~/.codex/sessions` otherwise; Claude Code search reads from `CLAUDE_CONFIG_DIR` plus `projects` when set or `~/.claude/projects` otherwise; and Pi search reads from `PI_CODING_AGENT_SESSION_DIR` when set, otherwise from `PI_CODING_AGENT_DIR` plus `sessions` or `~/.pi/agent/sessions` ([test](tests/search.compliance.l1.test.ts))
- ALWAYS: pickup-marker, literal-content, agent-session-id, and agent-kind searches reach every worktree of the invocation's product without a branch selector, while a top-level session whose recorded working directory lies outside that product is excluded ([test](tests/search.compliance.l1.test.ts))
- ALWAYS: default search is product-scoped, excludes agent subagent transcripts, bounds output by recent-session and result-count limits, and searches only agent-native transcript stores rather than `.spx/sessions/` SPX handoff session files ([test](tests/search.compliance.l1.test.ts))
- ALWAYS: branch-associated search returns only top-level sessions associated with the requested branch through top-level transcript branch metadata across agent-native stores, same-product worktree checkout roots, accepted top-level transcript command evidence, or Codex subagent transcript branch evidence attributed to the parent top-level session ([test](tests/search.compliance.l1.test.ts))
- NEVER: branch existence alone returns a session for `spx agent search --branch <name>` ([test](tests/search.compliance.l1.test.ts))
- NEVER: agent subagent transcripts are returned as branch-associated search result rows, even when subagent transcript evidence associates the parent top-level session with the requested branch ([test](tests/search.compliance.l1.test.ts))
