# Session Pick

PROVIDES an interactive terminal picker that lists claimable sessions, filters them as the operator types, previews the selected session's goal and next step, and claims the chosen session on selection
SO THAT agents and operators
CAN browse the session queue and claim work in a single interactive step instead of reading `session list` output and copying an identifier into `session pickup`

The picker renders through the terminal-UI runtime of [`spx/13-cli.enabler/21-terminal-ui.adr.md`](../../13-cli.enabler/21-terminal-ui.adr.md): its selection, filter, and key-action model is pure domain computation, its Ink component tree and terminal I/O live in the CLI-interface layer, and the claim it performs on selection reuses the [`spx/36-session.enabler/76-session-cli.enabler/session-cli.md`](../76-session-cli.enabler/session-cli.md) `pickup` handler.

## Assertions

### Scenarios

- Given the session queue, when the picker builds its candidate set, then only `todo` sessions appear, ordered by priority then recency as `sortSessions` orders them ([test](tests/picker-model.scenario.l1.test.ts))
- Given a candidate set and a filter query, when the model filters, then it returns exactly the candidates whose identifier, goal, or next step contains the query, preserving candidate order ([test](tests/picker-model.scenario.l1.test.ts))
- Given claimable sessions, when the picker mounts, then the frame lists each session with the highest-priority newest session selected and its goal and next step shown in the preview pane ([test](tests/picker-render.scenario.l1.test.ts))
- Given a mounted picker, when filter text is typed, then the frame narrows to the matching sessions and the preview follows the new selection ([test](tests/picker-render.scenario.l1.test.ts))
- Given a mounted picker over at least two sessions, when the down arrow then Enter is pressed, then the picker claims the second session, emits its `<PICKUP_ID>` tag to stdout, and unmounts ([test](tests/picker-render.scenario.l1.test.ts))
- Given a mounted picker, when Esc is pressed, then the picker unmounts with no session claimed, no `<PICKUP_ID>` tag emitted, and the queue unchanged ([test](tests/picker-render.scenario.l1.test.ts))
- Given an empty claimable queue, when the picker mounts, then the frame shows the empty-state message and Enter claims nothing ([test](tests/picker-render.scenario.l1.test.ts))

### Mappings

- The key-action reducer maps the down and up arrows to move-selection, a printable key to filter-append, Backspace to filter-delete, Enter to claim-selected, and Esc to cancel ([test](tests/picker-model.mapping.l1.test.ts))

### Properties

- For every candidate set and key sequence, the selected index stays within `[0, max(0, visibleCount - 1)]` — selection never leaves the visible range ([test](tests/picker-model.property.l1.test.ts))
- For every candidate set and query, the filtered set is a subsequence of the candidate set — filtering never reorders or invents candidates ([test](tests/picker-model.property.l1.test.ts))

### Compliance

- ALWAYS: when stdout or stdin is not a TTY, `spx session pick` writes a diagnostic to stderr naming that an interactive terminal is required and suggesting `session pickup --auto` or `session pickup <id>`, writes nothing to stdout, and exits non-zero per [`spx/13-cli.enabler/21-terminal-ui.adr.md`](../../13-cli.enabler/21-terminal-ui.adr.md) ([test](tests/picker-cli.compliance.l2.test.ts))
- ALWAYS: a session claimed on Enter performs the same atomic todo-to-doing move and `<PICKUP_ID>` emission as `spx session pickup`, reusing that handler rather than a duplicate claim path per [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md) ([audit])
- ALWAYS: the picker restores the terminal — exits raw mode and leaves the alternate screen — on unmount and on process exit, whether reached by claim, cancel, or a SIGINT or SIGTERM the process-lifecycle handlers forward, per [`spx/13-cli.enabler/21-terminal-ui.adr.md`](../../13-cli.enabler/21-terminal-ui.adr.md) ([audit])
- NEVER: the picker's selection, filter, or key-action model imports React, Ink, or a terminal API — it is pure domain computation per [`spx/13-cli.enabler/21-terminal-ui.adr.md`](../../13-cli.enabler/21-terminal-ui.adr.md) ([audit])
