# Known Issues

## Executed tests configure the recording command runner at the call site

`createRecordingCommandRunner` in `testing/harnesses/testing/typescript-runner.ts` takes a settings bag — `{ present, exitCode }` — and executed test files under `spx/**/tests/` construct that bag inline, as in `createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE })`. The presence flag survives both ownership probes: it is the same whether the assertion holds or its opposite does, and the same in any product, so it is cross-assertion double policy the harness owns, while this node's own rule says executed testing assertion files never construct dependency bags or runner settings.

**Evidence:** `grep -rn "createRecordingCommandRunner({ present: true, exitCode" spx testing --include=*.ts` reports 62 call sites, two of them in the linked tests of `spx/41-test.enabler/90-targeted-execution.enabler`.

**Impact:** each executed test decides the double's presence policy itself, so a change to how the recording runner reports language presence is repeated at every site, and a site that sets `present: false` by mistake reads as a language-absent scenario without saying so.

**Settlement condition:** the harness exports named recording-runner factories — a present runner exiting with a given code, an absent runner — and every executed test file constructs the runner through them, so no test file builds the settings bag.
