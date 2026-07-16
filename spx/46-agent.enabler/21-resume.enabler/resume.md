# Resume

PROVIDES fast discovery and resume launch of recent coding-agent sessions, scoped to the current worktree for Codex, Claude Code, and Pi or to an explicitly recorded branch for agents whose session metadata carries branch identity
SO THAT users working in Git worktrees
CAN continue the right Codex, Claude Code, or Pi conversation through `spx agent resume` after a terminal restart, without recalling which agent or session it was

## Assertions

### Scenarios

- Given `spx agent resume` runs from a subdirectory of a Git worktree, when candidates are discovered, then sessions whose recorded current working directory resolves inside the same local worktree root are included and sessions from sibling worktrees are excluded ([test](tests/pi-resume.scenario.l1.test.ts))
- Given `spx agent resume --branch <name>` runs, when candidates are discovered, then Codex and Claude Code sessions whose initial recorded branch equals `<name>` are included regardless of which worktree they ran in, while Pi sessions without recorded branch identity are excluded ([test](tests/pi-resume.scenario.l1.test.ts))
- Given matching Codex, Claude Code, and Pi sessions exist, when `spx agent resume` runs in an interactive terminal, then the user can choose one candidate and SPX launches that candidate through the agent's native resume command ([test](tests/pi-resume.scenario.l1.test.ts))

### Mappings

- Resume mode maps to behavior: default opens the interactive picker, `--latest` launches the newest matching session, `--list` prints matching sessions, and `--json` prints matching sessions as JSON ([test](tests/resume.mapping.l1.test.ts))
- Resume scope maps to candidate set: no scope flag selects Codex, Claude Code, and Pi sessions in the current worktree; `--branch <name>` selects sessions carrying that initial recorded branch across worktrees and excludes sessions without recorded branch identity ([test](tests/resume.mapping.l1.test.ts), [test](tests/pi-resume.mapping.l1.test.ts))
- Worktree and branch resume scopes each compose with default, latest, list, and JSON output modes ([test](tests/resume.mapping.l1.test.ts))
- Resume activity window maps to candidate eligibility: without `--since`, the default recent-session window applies; with `--since <duration>`, only sessions whose newest parseable transcript activity falls within that duration are eligible; either window composes with every scope and output mode ([test](tests/resume.mapping.l1.test.ts))
- Conflicting resume mode flags map to a non-zero diagnostic that tells the user to choose only one resume mode and prevents any native agent launch ([test](tests/resume.mapping.l1.test.ts))
- Agent candidate maps to launch command and context: every candidate launches from the candidate's recorded current working directory, a Codex candidate uses `codex resume <session-id>`, a Claude Code candidate uses `claude --resume <session-id>`, and a Pi candidate uses `pi --session <source-path>` ([test](tests/resume.mapping.l1.test.ts), [test](tests/pi-resume.mapping.l1.test.ts))

### Compliance

- ALWAYS: within the active scope and activity window, at most the five sessions with the newest known transcript activity per agent are shown, for at most fifteen candidates total; without explicit `--since`, sessions without a parseable transcript activity timestamp fill remaining per-agent slots after timestamped sessions, while explicit `--since` excludes them ([test](tests/resume.compliance.l1.test.ts), [test](tests/pi-resume.compliance.l1.test.ts))
- ALWAYS: only sessions whose file modification time falls within the active recent-session window are read, so a session whose file is older than the default or caller-supplied window or carries a future modification time does not surface ([test](tests/resume.compliance.l1.test.ts))
- ALWAYS: `--since <duration>` accepts a positive duration parsed by the declared duration-parser dependency and rejects invalid, zero, negative, non-finite, or unsafe durations with a non-zero diagnostic before any native agent launch ([test](tests/resume.compliance.l1.test.ts))
- ALWAYS: when `--since` is explicit, file modification time only bounds transcript reads; candidate eligibility is decided by the newest parseable timestamp in the bounded transcript tail, and activity before the cutoff does not surface ([test](tests/resume.compliance.l1.test.ts))
- ALWAYS: candidate discovery resolves the active scope's reference once — the invocation worktree root for worktree scope, the target name for branch scope — and classifies each candidate from its own recorded working directory or branch, never resolving a worktree root per candidate ([test](tests/resume.compliance.l1.test.ts))
- ALWAYS: a candidate is identified from its transcript's opening metadata, and its activity timestamp is identified from a bounded transcript tail scan when present, never by parsing the whole transcript ([test](tests/resume.compliance.l1.test.ts))
- ALWAYS: sessions sharing one session id collapse to a single candidate, the source with the newest transcript activity ([test](tests/resume.compliance.l1.test.ts))
- ALWAYS: Codex candidates include interactive Codex transcripts and exclude non-interactive exec transcripts and subagent-thread transcripts, because `spx agent resume` launches through the interactive `codex resume` command ([test](tests/resume.compliance.l1.test.ts))
- ALWAYS: Claude Code candidates exclude subagent transcripts, because a subagent thread is not a resumable top-level conversation ([test](tests/resume.compliance.l1.test.ts))
- ALWAYS: Pi candidates have a versioned opening session row carrying the session id and recorded working directory, and launch from the exact discovered source path ([test](tests/pi-resume.compliance.l1.test.ts))
- ALWAYS: explicit activity windows admit a long-running Pi transcript when its bounded tail carries recent activity and exclude it when the newest tail activity is stale, without requiring the opening row to remain in the tail ([test](tests/pi-resume.compliance.l1.test.ts))
- ALWAYS: Codex candidates are read from `CODEX_HOME` plus `sessions` when set or `~/.codex/sessions` otherwise; Claude Code candidates are read from `CLAUDE_CONFIG_DIR` plus `projects` when set or `~/.claude/projects` otherwise; Pi candidates are read from `PI_CODING_AGENT_SESSION_DIR` when set, otherwise from `PI_CODING_AGENT_DIR` plus `sessions` or `~/.pi/agent/sessions` ([test](tests/pi-resume.compliance.l1.test.ts))
- NEVER: branch-scoped discovery enumerates a session store for an agent whose transcript metadata carries no branch identity ([test](tests/pi-resume.compliance.l1.test.ts))
- ALWAYS: when default interactive resume mode runs without stdout or stdin attached to a TTY, `spx agent resume` writes a diagnostic to stderr naming that an interactive terminal is required, writes nothing to stdout, and exits non-zero per `spx/13-cli.enabler/21-terminal-ui.adr.md` ([test](tests/resume-cli.compliance.l1.test.ts))
