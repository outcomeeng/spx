# Picker Test Harness

PROVIDES `renderPickerView`, which mounts the interactive `SessionPicker` through ink-testing-library and returns a queried view of the rendered frame — rows by session id, the selected row, the preview block, the footer hint — plus semantic key drivers (arrow, type, enter, esc) that write terminal byte sequences and await Ink's flush
SO THAT the session-pick enabler's picker-render L1 scenarios
CAN assert the picker's rendered intent and key handling without splitting raw frame strings or emitting raw terminal bytes by hand

## Assertions

### Scenarios

- Given a claimable session, when `renderPickerView` mounts the picker and the down- and up-arrow drivers are invoked, then the queried view surfaces a row for that session, a non-empty preview block, and a valid selection ([test](tests/picker-test-harness.scenario.l1.test.ts))

### Compliance

- ALWAYS: frames are read through ink-testing-library's rendered output and keys are driven by writing terminal byte sequences and awaiting Ink's flush — the harness drives no real terminal ([audit])
- ALWAYS: the Escape key driver outwaits Ink's Escape-disambiguation window so a standalone Escape flushes as Escape rather than the start of an escape sequence ([audit])
