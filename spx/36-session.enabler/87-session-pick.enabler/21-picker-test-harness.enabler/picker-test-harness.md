# Picker Test Harness

PROVIDES `renderPickerView`, which mounts the interactive `SessionPicker` through ink-testing-library and returns a queried view of the rendered frame — rows by session id, the selected row, the preview block, the footer hint — plus semantic key drivers (arrow, type, enter, esc) that write terminal byte sequences and await Ink's flush
SO THAT the session-pick enabler's picker-render L1 scenarios
CAN assert the picker's rendered intent and key handling without splitting raw frame strings or emitting raw terminal bytes by hand

## Assertions

### Scenarios

- Given two claimable sessions, when `renderPickerView` mounts the picker, then the queried view surfaces a row for each session and a non-empty preview block; and when the down-arrow driver is invoked the selected row moves to the other session, and the up-arrow driver returns it ([test](tests/picker-test-harness.scenario.l1.test.ts))

### Compliance

- ALWAYS: frames are read through ink-testing-library's rendered output, and the arrow, type, enter, and esc key drivers each write a terminal byte sequence to the injected ink-testing-library stdin and await Ink's flush — the harness drives no real terminal, per [`spx/13-cli.enabler/21-terminal-ui.adr.md`](../../../13-cli.enabler/21-terminal-ui.adr.md) ([audit](../../../13-cli.enabler/21-terminal-ui.adr.md))
- ALWAYS: the Escape key driver outwaits Ink's Escape-disambiguation window so a standalone Escape flushes as Escape rather than the start of an escape sequence ([audit])
