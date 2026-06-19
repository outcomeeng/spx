# Session Pick

PROVIDES an interactive terminal picker over claimable sessions that, on a runtime keystroke, replaces itself with the agent command that resumes the selected session — `claude "/pickup <id>"` or `codex "$pickup <id>"`, optionally `--auto-continue`
SO THAT operators
CAN browse the session queue and hand a session to claude or codex in one keystroke instead of typing the pickup command by hand

## Assertions

### Scenarios

- Given claimable sessions, when the picker mounts, then the frame lists each session with the highest-priority newest session selected and its goal and next step shown in the preview pane ([test](tests/picker-render.scenario.l1.test.ts))
- Given a mounted picker in browse mode, when the filter key opens filter mode and query text is typed, then the frame narrows to the matching sessions; when Enter is pressed the picker returns to browse mode keeping the query; when Esc is pressed it returns to browse mode with the query cleared ([test](tests/picker-render.scenario.l1.test.ts))
- Given a mounted picker over the selected session, when a runtime launch key is pressed, then the picker hands off that session with the chosen runtime and auto-continue flag and unmounts, performing no in-process claim ([test](tests/picker-render.scenario.l1.test.ts))
- Given a mounted picker, when the quit key or Esc is pressed in browse mode, then the picker unmounts with no launch and the queue unchanged ([test](tests/picker-render.scenario.l1.test.ts))
- Given an empty claimable queue, when the picker mounts, then the frame shows the empty-state message and a launch key launches nothing ([test](tests/picker-render.scenario.l1.test.ts))
- Given a session whose goal exceeds the row's available width, when the picker mounts, then the session occupies a single row with its goal truncated to that width and no row wraps to a second line, the keybinding hint renders on its own line below the title, and each preview label is separated from its value by a space ([test](tests/picker-render.scenario.l1.test.ts))
- Given a resolved launch command, when the launcher hands off to the agent, then it suspends the parent's foreground-signal handling, spawns the agent, and on the agent's exit restores that handling and resolves the agent's status — a non-zero status when the agent exits without one or its binary cannot be spawned ([test](tests/launch-agent.scenario.l1.test.ts))
- Given the picker mounted over claimable sessions, when the operator launches a session, then `runPicker` unmounts the Ink application and resolves the chosen session, runtime, and auto-continue flag; when the operator quits, it unmounts and resolves no choice ([test](tests/run-picker.scenario.l1.test.ts))

### Mappings

- In browse mode, the key-action reducer maps the down and up arrows to move-selection, the filter key to enter-filter, `c` and `C` to launch claude without and with auto-continue, `x` and `X` to launch codex without and with auto-continue, and the quit key or Esc to quit ([test](tests/picker-model.mapping.l1.test.ts))
- In filter mode, the key-action reducer maps a printable key to filter-append, Backspace or Delete to filter-delete, Enter to apply-filter, Esc to clear-filter, and the down and up arrows to move-selection — so a printable launch character is filter text, not a launch, while a filter is open ([test](tests/picker-model.mapping.l1.test.ts))

### Properties

- For every session set, building the candidate set yields exactly the `todo` sessions, ordered by priority then recency as `sortSessions` orders them ([test](tests/picker-model.property.l1.test.ts))
- For every candidate set and query, filtering returns exactly the candidates whose identifier, goal, or next step contains the query, case-insensitively, in candidate order ([test](tests/picker-model.property.l1.test.ts))
- For every candidate set and key sequence across mode transitions, the selected index stays within `[0, max(0, visibleCount - 1)]` — selection never leaves the visible range ([test](tests/picker-model.property.l1.test.ts))
- For every candidate set and query, the filtered set is a subsequence of the candidate set — filtering never reorders or invents candidates ([test](tests/picker-model.property.l1.test.ts))
- For every runtime, auto-continue flag, and session reference, the launch command is the runtime's binary with a single prompt argument `<prefix>pickup <reference>` — prefix `/` for claude, `$` for codex — extended by `--auto-continue` exactly when the flag is set ([test](tests/picker-model.property.l1.test.ts))
- For every session, the pickup reference is the bare session id when no custom store directory is given and the session's absolute file path when one is — because the launched agent resolves an id against its own cwd-scoped store but cannot reach a custom store, so it is handed the path to read directly ([test](tests/picker-model.property.l1.test.ts))
- For every string and every width `n` at least 1, truncating the string to width `n` returns a string no wider than `n` — the input unchanged when it already fits, otherwise a prefix ending in a single ellipsis character ([test](tests/picker-model.property.l1.test.ts))
- For every string, reducing it to a single display line collapses every run of whitespace — including newlines and tabs — to one space and trims the ends, so a goal carrying line breaks never breaks the one-row layout ([test](tests/picker-model.property.l1.test.ts))

### Compliance

- ALWAYS: when stdout or stdin is not a TTY, `spx session pick` writes a diagnostic to stderr naming that an interactive terminal is required and suggesting the agent pickup command be run directly, writes nothing to stdout, and exits non-zero per [`spx/13-cli.enabler/21-terminal-ui.adr.md`](../../13-cli.enabler/21-terminal-ui.adr.md) ([test](tests/picker-cli.compliance.l2.test.ts))
- ALWAYS: on a launch keystroke the picker restores the terminal and the process is then succeeded by the resolved agent command, so claude or codex inherits the terminal; the agent is spawned through the injected non-registering foreground runner — not a direct process API in the descriptor, the lifecycle-registering runner, or the managed-subprocess helper — and the parent's signal handling is suspended for the agent's lifetime, per [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md) and [`spx/13-cli.enabler/15-cli-architecture.adr.md`](../../13-cli.enabler/15-cli-architecture.adr.md) ([audit])
- NEVER: the picker claims the selected session in-process or calls the `pickup` handler — the claim and context injection are the launched agent's `/pickup`, not `pick` ([audit])
- ALWAYS: the picker restores the terminal — exits raw mode and leaves the alternate screen — on unmount and on process exit, whether reached by launch, quit, or a SIGINT or SIGTERM the process-lifecycle handlers forward, per [`spx/13-cli.enabler/21-terminal-ui.adr.md`](../../13-cli.enabler/21-terminal-ui.adr.md) ([audit])
- NEVER: the picker's selection, filter, key-action, or launch-command model imports React, Ink, or a terminal API — it is pure domain computation per [`spx/13-cli.enabler/21-terminal-ui.adr.md`](../../13-cli.enabler/21-terminal-ui.adr.md) ([audit])
