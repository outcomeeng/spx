# Issues: Agent

## Agent home directory resolution diverges across agent surfaces

`spx diagnose methodology-context` resolves Codex and Claude Code home directories from `CODEX_HOME` and `CLAUDE_CONFIG_DIR` before falling back to the default home-directory paths. `spx agent resume` and `spx agent search` resolve agent transcript stores from the operating-system home directory only.

Products using relocated agent homes can therefore see methodology-context diagnose probe one agent home while agent resume/search inspect another.

Revisit when changing `src/domains/agent/resume.ts`, `src/commands/agent/search.ts`, or the agent-home resolution path:

- extract or reuse one shared agent-home resolver for Codex and Claude Code surfaces
- route resume and search transcript-store resolution through the same `CODEX_HOME` / `CLAUDE_CONFIG_DIR` fallback order used by methodology-context probing
- cover relocated Codex and Claude Code homes in the owning agent tests
