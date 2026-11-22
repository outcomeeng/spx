# Known Issues: 33-harness-environment.enabler

## Unregistered agent ids are rejected only for instruction files and the agents map

**Evidence:** `tests/harness-environment-descriptor.compliance.l1.test.ts` line 149 states the rule that configured instruction files, marketplaces, plugins, and skills reference registered agent ids. Only the instruction-file `targetAgents` entry and the agents-map key are exercised with an unregistered agent id. No case supplies one to a marketplace, plugin, or skill entry.

**Impact:** a descriptor that skips agent validation for marketplace, plugin, and skill entries passes every linked test while the rule is unfulfilled.

**Settlement condition:** a violating case per entry kind (marketplace, plugin, skill) supplies an unregistered agent id and observes the rejection.

## The registry and the legacy session derivations disagree on the Claude variable and on precedence `src/lib/agent-environment/agents/claude-code.ts` `CLAUDE_CODE_AGENT identityVariable` `spx/33-harness-environment.enabler/26-claude-code.enabler/claude-code.md identity-variable`

**Evidence:** the agent registry identifies Claude Code by `CLAUDE_CODE_SESSION_ID`, and identifies no agent and no session when two or more registered identity variables are non-empty. The legacy derivations still read `CLAUDE_SESSION_ID` and take the first variable set:

- `resolveAgentSessionId` in `src/domains/session/agent-session.ts` reads `CLAUDE_SESSION_ID`, then `CODEX_THREAD_ID`;
- `resolveInvokingAgent` in `src/interfaces/cli/coding-agent.ts` reads `CODEX_THREAD_ID`, then `CLAUDE_SESSION_ID`;
- the session-start hook in `src/domains/hooks/session-start.ts` exports `CLAUDE_SESSION_ID`.

The specs under `spx/36-session.enabler` assert `CLAUDE_SESSION_ID`.

**Impact:** with only `CLAUDE_CODE_SESSION_ID` set, the registry identifies Claude Code while the legacy derivations find no session. With only `CLAUDE_SESSION_ID` set, the reverse holds. With several identity variables set, the legacy derivations pick one where the registry identifies none. No consumer reads the registry yet, so users observe only the legacy behavior.

**Settlement condition:** the session derivations, the session-start hook, and the invoking-agent detection identify the agent and its session through the agent registry's resolver, with their specs and tests, and their files leave the agent-names rule's transitional allowlist.
