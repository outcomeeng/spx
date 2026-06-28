# Resume

PROVIDES recent coding-agent session discovery and resume launch
SO THAT users working in a Git worktree
CAN continue matching Codex and Claude Code conversations through `spx agent resume`

## Assertions

### Scenarios

- Given `spx agent resume` runs from a subdirectory of a Git worktree, when matching sessions are discovered, then sessions whose recorded current working directory resolves inside the same local worktree root are included and sessions from sibling worktrees are excluded ([test](tests/resume.scenario.l1.test.ts))
- Given matching Codex and Claude Code sessions exist, when `spx agent resume` runs in an interactive terminal, then the user can choose one candidate and SPX launches that candidate through the agent's native resume command ([test](tests/resume.scenario.l1.test.ts))

### Mappings

- Resume mode maps to behavior: default opens the interactive picker, `--latest` launches the newest matching session, `--list` prints matching sessions, and `--json` prints matching sessions as JSON ([test](tests/resume.mapping.l1.test.ts))
- Conflicting resume mode flags map to a non-zero diagnostic that tells the user to choose only one resume mode and prevents any native agent launch ([test](tests/resume.mapping.l1.test.ts))
- Agent candidate maps to launch command and context: every candidate launches from the candidate's recorded current working directory, a Codex candidate uses `codex resume <session-id>`, and a Claude Code candidate uses `claude --resume <session-id>` ([test](tests/resume.mapping.l1.test.ts))

### Compliance

- ALWAYS: recent matching candidates are sorted newest first, limited to sessions modified within the last 7 days, and capped at 20 displayed candidates ([test](tests/resume.compliance.l1.test.ts))
- ALWAYS: candidate worktree-root resolution runs with bounded concurrency and preserves newest-first result order before the 20-candidate display cap is applied ([test](tests/resume.compliance.l1.test.ts))
- ALWAYS: Codex candidates are read from `~/.codex/sessions` and Claude Code candidates are read from `~/.claude/projects` ([test](tests/resume.compliance.l1.test.ts))
- ALWAYS: when default interactive resume mode runs without stdout or stdin attached to a TTY, `spx agent resume` writes a diagnostic to stderr naming that an interactive terminal is required, writes nothing to stdout, and exits non-zero per [`spx/13-cli.enabler/21-terminal-ui.adr.md`](/spx/13-cli.enabler/21-terminal-ui.adr.md) ([test](tests/resume.compliance.l2.test.ts))
