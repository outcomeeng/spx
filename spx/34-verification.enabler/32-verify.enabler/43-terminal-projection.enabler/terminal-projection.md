# Terminal Projection

PROVIDES terminal completion, type-specific terminal validation, resumable status, finding-count projection, and rendered journal projection for typed verification runs
SO THAT agents, CI jobs, and launchers
CAN close a scoped verification run with a terminal status and optional terminal metadata and inspect the run's durable state from its journal history

## Assertions

### Scenarios

- Given a started run with recorded scope and findings, when finish records a rejected terminal status, then it records terminal completion, seals the journal, and renders a terminal projection from the event history ([test](tests/verify-lifecycle.scenario.l1.test.ts))
- Given a sealed review run with terminal completion, when render is requested, then it renders the journal projection including the authoritative finding count from the event history without appending journal events ([test](tests/verify-render.scenario.l1.test.ts))

### Compliance

- ALWAYS: `finish` requires a terminal status in the journal terminal-status vocabulary before it records terminal completion or seals the journal ([test](tests/verify-lifecycle.compliance.l1.test.ts))
- ALWAYS: when a verification type registers terminal validation, `finish` rejects a supplied terminal status outside the type's terminal vocabulary, or a terminal status or terminal metadata that conflicts with the run evidence, before recording terminal completion or sealing the journal ([test](tests/verify-lifecycle.compliance.l1.test.ts))
- ALWAYS: `finish` rejects an unsupported scope type or a malformed changeset scope before it records terminal completion or seals the journal ([test](tests/verify-lifecycle.compliance.l1.test.ts))
- ALWAYS: a repeated `finish` returns the existing terminal projection and appends no second terminal completion event ([test](tests/verify-lifecycle.compliance.l1.test.ts))
- ALWAYS: a repeated `finish`, `status`, or `render` rejects a selector that conflicts with a present recorded-input sidecar before it projects a terminal run from journal history ([test](tests/verify-lifecycle.compliance.l1.test.ts), [test](tests/verify-status.compliance.l1.test.ts))
- ALWAYS: a second `finish` with a different terminal status returns the terminal projection recorded by the first `finish` and appends no additional terminal completion event ([test](tests/verify-lifecycle.compliance.l1.test.ts))
- ALWAYS: `status` reports the run token, verification type, scope type, sealed state, last journal sequence, terminal status when present, and next legal lifecycle actions ([test](tests/verify-status.compliance.l1.test.ts))
- ALWAYS: `finish`, `status`, and `render` report the run token and authoritative finding count from the journal projection for sealed review runs ([test](tests/verify-status.compliance.l1.test.ts))
- ALWAYS: `render` projects an unsealed run read-only — reporting `sealed: false` with no terminal status, appending no journal event, and sealing no run ([test](tests/verify-render.compliance.l1.test.ts))
