# Search

PROVIDES coding-agent session search over Codex, Claude Code, and Pi agent-native transcript stores
SO THAT users and diagnostic surfaces operating in a product worktree
CAN find agent-native sessions by handoff pickup markers, literal transcript content, agent session id, branch association, and agent kind without treating SPX handoff session files as agent sessions

## Assertions

### Scenarios

- Given `spx agent search` runs in a worktree of a bare-repository pool, when the default search scope resolves, then the Git common-dir product root is returned rather than the local worktree root, per `spx/15-worktree-management.pdr.md` ([test](tests/search.scenario.l1.test.ts))
- Given Codex and Claude Code top-level transcripts and versioned Pi top-level transcripts under the current product scope, plus a transcript outside that scope, when `spx agent search --pickup-id <id>` runs, then only product-scoped top-level agent sessions whose transcript contains the exact pickup marker are returned ([test](tests/search.scenario.l1.test.ts))
- Given a matching search result, when `spx agent search --json` runs, then the JSON output exposes the agent kind, agent session id, current working directory, source transcript path, modification time, updated timestamp, branch, and match reasons for that result ([test](tests/search.scenario.l1.test.ts))
- Given a top-level Codex, Claude Code, or Pi session whose current working directory is inside a same-product worktree checked out on the requested branch while its transcript records no occurrence of that branch, when `spx agent search --branch <name> --json` runs, then the session is returned with `branch` in its match reasons ([test](tests/search.scenario.l1.test.ts))
- Given a Codex subagent transcript whose parent top-level session exists and whose branch metadata names the requested branch, when `spx agent search --branch <name> --json` runs, then the parent top-level session is returned with the branch-evidence current working directory, `branch` in its match reasons, and the subagent transcript is not returned as its own row ([test](tests/search.scenario.l1.test.ts))

### Mappings

- `--pickup-id <id>` maps to an exact content search for `<PICKUP_ID><id></PICKUP_ID>`, `--contains <literal>` maps to a literal transcript content search, `--session-id <id>` maps to agent session metadata, `--branch <name>` maps to branch association from transcript branch metadata recorded in any transcript record where the agent adapter declares a record reader and in the opening record where it declares none, same-product worktree checkout roots, accepted transcript command evidence, and Codex subagent transcript branch evidence attributed to the parent top-level session, `--agent <kind>` maps to the selected agent adapter set, `--limit <n>` maps to the maximum result count, `--since <duration>` maps to the recent-session activity bound, and `--all` maps to removal of that bound ([test](tests/search.mapping.l1.test.ts))

### Properties

- A session whose agent adapter declares a transcript record reader and whose transcript records the requested branch in any record is returned by `spx agent search --branch <name>`, carrying the working directory recorded alongside that branch and `branch` among its match reasons, whichever position that branch occupies and whichever field path that record carries its working directory under ([test](tests/branch-association.property.l1.test.ts))
- A session whose agent adapter declares a transcript record reader and whose transcript records evidence for the requested selector is returned whichever session-store directory holds that transcript ([test](tests/store-placement.property.l1.test.ts))
- `spx agent search --since <duration>` admits exactly the sessions whose newest recorded transcript activity falls within that duration, for every duration and transcript age ([test](tests/reach-window.property.l1.test.ts))
- Absent `--since` and `--all`, `spx agent search` bounds candidates to a search-owned thirty-day recent-session window that varies independently of the window `spx agent resume` applies ([test](tests/reach-window.property.l1.test.ts))

### Compliance

- NEVER: a session whose transcript records no occurrence of the requested branch and whose recorded working directories all lie outside the invocation product is returned for `spx agent search --branch <name>` ([test](tests/branch-association.compliance.l1.test.ts))
- NEVER: a session whose transcript records the requested branch only where the recorded working directory lies outside the invocation product is returned for `spx agent search --branch <name>` ([test](tests/branch-association.compliance.l1.test.ts))
- NEVER: a search whose only selector is content reads a transcript for structural session metadata when that selector's needle is absent from the transcript's recorded content ([test](tests/scan-bound.compliance.l1.test.ts))
- NEVER: `spx agent search` reads any transcript's full content when the invocation carries no selector ([test](tests/scan-bound.compliance.l1.test.ts))
- NEVER: `spx agent search` accepts an invalid, zero, negative, non-finite, or unsafe `--since` duration; each is rejected with a non-zero diagnostic before any result reaches standard output ([test](tests/reach-window.compliance.l1.test.ts))
- ALWAYS: Codex search reads from `CODEX_HOME` plus `sessions` when set or `~/.codex/sessions` otherwise; Claude Code search reads from `CLAUDE_CONFIG_DIR` plus `projects` when set or `~/.claude/projects` otherwise; and Pi search reads from `PI_CODING_AGENT_SESSION_DIR` when set, otherwise from `PI_CODING_AGENT_DIR` plus `sessions` or `~/.pi/agent/sessions` ([test](tests/search.compliance.l1.test.ts))
- ALWAYS: pickup-marker, literal-content, agent-session-id, and agent-kind searches reach every worktree of the invocation's product without a branch selector; a pickup-marker or literal-content search whose agent adapter declares a transcript record reader excludes a top-level session whose recorded working directories all lie outside that product, and every other of those searches excludes one whose opening working directory lies outside it ([test](tests/search.compliance.l1.test.ts))
- ALWAYS: default search is product-scoped, excludes agent subagent transcripts, bounds output by recent-session and result-count limits, and searches only agent-native transcript stores rather than `.spx/sessions/` SPX handoff session files ([test](tests/search.compliance.l1.test.ts))
- ALWAYS: branch-associated search returns only top-level sessions associated with the requested branch through transcript branch metadata recorded in any transcript record where the agent adapter declares a record reader and in the opening record where it declares none, same-product worktree checkout roots, accepted top-level transcript command evidence, or Codex subagent transcript branch evidence attributed to the parent top-level session ([test](tests/search.compliance.l1.test.ts))
- NEVER: branch existence alone returns a session for `spx agent search --branch <name>` ([test](tests/search.compliance.l1.test.ts))
- NEVER: agent subagent transcripts are returned as branch-associated search result rows, even when subagent transcript evidence associates the parent top-level session with the requested branch ([test](tests/search.compliance.l1.test.ts))
