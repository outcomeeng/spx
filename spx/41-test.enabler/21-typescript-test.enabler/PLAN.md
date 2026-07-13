# Plan: journal-streaming Vitest reporter (slice-1 /apply)

> Reconcile against `spx/34-verification.enabler/PLAN.md` (the all-slice program
> plan), `spx/34-verification.enabler/verification.md`,
> `spx/34-verification.enabler/43-execute.enabler/execute.md`, this node's
> `typescript-test.md`, and the child spec
> `spx/41-test.enabler/21-typescript-test.enabler/32-journal-reporter.enabler/journal-reporter.md`
> first. This note is coordination for the reporter slice, not product truth.

## Composed structure

The journal-streaming reporter concern is decomposed into the child enabler
`spx/41-test.enabler/21-typescript-test.enabler/32-journal-reporter.enabler`
(Declared, in `spx/EXCLUDE`), at index 32 — an independent peer of
`spx/41-test.enabler/21-typescript-test.enabler/32-test-harness.enabler`, with no
ordering edge proven between them. The parent `typescript-test.md` keeps its
CLI-flag adapter concern (spawn Vitest with `--exclude`, return an exit code,
serving `spx test`); the child owns the programmatic run and the reporter
(serving `spx verification test run`).

## /apply the child (`32-journal-reporter.enabler`)

Order per the `/apply` flow — architecture, then tests, then implementation, with
the applying audit gates between:

1. **Architecture (`/architect-typescript`).** Author an ADR for the reporter: an
   injected Vitest `Reporter` that is a pure translator from Vitest lifecycle
   events to recorder-port calls, holding the recorder's evidence-append ports it
   receives by injection (never constructing journal events). The programmatic
   Vitest run is started through the Node API (`startVitest` / `createVitest`)
   with the reporter registered in the run's `reporters`, not via a `--reporter`
   CLI flag. Keep the CLI-flag path (`typescript-test.md`) intact and separate —
   both coexist until the equivalence gate (`spx/34-verification.enabler/PLAN.md`).
   The reporter is TypeScript/Vitest-specific and lives here per
   `spx/19-language-registration.adr.md`; the executor stays language-neutral and
   reaches this runner through `src/test/registry.ts`.

2. **Hook -> journal-event mapping** (from Vitest's `Reporter`,
   `packages/vitest/src/node/types/reporter.ts`):
   - `onTestRunStart(specifications)` — the run is already open (the executor
     called the recorder's `start`); the reporter appends into that open run.
   - `onTestModuleStart/End(testModule)` — **scope** append (a test module is a
     scope unit).
   - `onTestCaseResult(testCase)` — **finding** append for a failing case; a
     passing case appends no finding.
   - `onTestRunEnd(testModules, errors, reason)` — yields the **terminal** status
     (`reason` maps to the terminal status); the executor seals the run via the
     recorder's `finish` (`execute.md` owns the terminal write). The reporter
     signals the status; it does not own `finish`.

3. **Dependencies / boundaries.** The reporter appends through the recorder's
   evidence ports (`scope add` / `finding add`) of
   `spx/34-verification.enabler/32-verify.enabler`, passed down by the executor
   (`spx/34-verification.enabler/43-execute.enabler`), which opens the run and
   drives this adapter's programmatic path with the reporter injected. Never
   hand-format journal events (`verify.md` forbids a caller doing so). Streaming
   granularity is an adapter property: this reporter streams cases natively, with
   no `--reporter=json` batch capture and no conversion.

4. **Tests (`/test-typescript`).** `l1` for the hook->event translation (feed
   constructed Vitest event objects, assert recorder-port calls) and the
   compliance rules (ports-not-events, per-hook streaming, programmatic
   registration); `l2` for a real programmatic Vitest run over a fixture module
   with one passing and one failing case. `l2` real-tool tests are provisioned in
   CI per `spx/41-test.enabler/15-ci-runner-toolchain.adr.md`. The reporter's test
   fixtures (a fake recorder-port sink, synthetic Vitest events) either extend
   `spx/41-test.enabler/21-typescript-test.enabler/32-test-harness.enabler` or are
   owned by a test-harness child of the reporter node — settle in `/test`.

5. **Un-EXCLUDE** the child once its tests pass, then regenerate the committed
   status per the graduation procedure in `CLAUDE.md` (never hand-edit
   `spx.status.json`).

## After the reporter

The reporter is the per-reference-evidence prerequisite for the rest of slice 1:
the executor (`spx/34-verification.enabler/43-execute.enabler`), the
`spx verification test run` command path
(`spx/60-surfaces.enabler/21-cli-surface.enabler`), and the fold path in
`spx spec status --update`
(`spx/31-spec-domain.enabler/54-spec-cli-commands.enabler`). See
`spx/34-verification.enabler/PLAN.md` for the full node set and order.

## Reserved horizon (out of slice 1)

Reporters/adapters for `validation`, `evaluation`, `audit`, and `review` are the
executor's reserved horizon, not children of this node. Python's pytest reporter
is a later slice. Only the TypeScript/Vitest reporter is in slice 1.
