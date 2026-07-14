# Drive Mode

A verification run records its drive mode — caller-driven or spx-driven — as a field on a verify-owned run-context event the `start` operation appends to the run journal, and `status` and `render` fold that field from the event history to filter the run's next legal lifecycle actions, so an unsealed spx-driven run advertises no caller evidence-append action. Drive mode is source-owned in `src/domains/verify/` as a closed two-member registry, defaults to caller-driven for the caller `spx verification run start` path, and reaches spx-driven only when spx opens the run itself.

## Rationale

`spx/34-verification.enabler/32-verify.enabler/13-verify-module-structure.adr.md` decides that a run's next legal lifecycle actions are a pure fold over the run's event history and never read the journal run-state schema. Drive mode drives that fold, so it lives where the fold can read it: a verify-owned journal event, the symmetric counterpart to the verify-owned terminal-completion event the same decision establishes. Recording drive mode in the recorded-input sidecar instead would force the next-action projection to mix sidecar state into a fold the governing decision reserves for event history, and reading the journal substrate's own run-started event would couple the verify projection to the journal run-state schema that decision forbids.

A run has one drive mode fixed at `start`: the party that opens the run drives it to completion. A caller opening a run through `spx verification run start` drives its own evidence appends, so that path records caller-driven. spx opening a run to stream a runner it drives records spx-driven, and no caller appends to it. The next-action filter, not seal-on-abort, closes the gap a crashed spx-driven run would otherwise leave — a killed process runs no cleanup, so the recorded drive mode is the durable signal that an unsealed run advertises no caller append action.

## Invariants

- A run's drive mode is written exactly once, by `start`, and never changes over the run's lifetime.
- The next-action projection of an unsealed run is a pure function of the run's event history, including its recorded drive mode.
- A caller-driven unsealed run advertises the caller evidence-append actions; an spx-driven unsealed run advertises none of them.

## Verification

### Audit

- ALWAYS: drive mode is a closed two-member registry — caller-driven and spx-driven — source-owned in `src/domains/verify/`, from which the union and any schema derive ([audit])
- ALWAYS: `start` records the run's drive mode on a verify-owned run-context journal event, so later lifecycle operations read it by folding the event history ([audit])
- ALWAYS: the caller `spx verification run start` path records caller-driven drive mode, and only spx opening the run itself records spx-driven ([audit])
- ALWAYS: the unsealed-run next-action projection is a pure fold over the run's event history and derives the advertised actions from the recorded drive mode ([audit])
- NEVER: the next-action projection reads drive mode from the recorded-input sidecar or the journal run-state schema rather than folding it from the run's event history ([audit])
- ALWAYS: the drive-mode recording and next-action projection are pure functions over injected event history, verifiable without process, filesystem, or journal I/O ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or module replacement stands in for the event history under test — tests pass event records through the public projection and start-event constructors ([audit])
