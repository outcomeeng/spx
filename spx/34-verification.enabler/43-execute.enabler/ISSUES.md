# Issues: spx-driven verification executor

> Coordination note, not product truth. Reconcile against `execute.md`, the verify
> lifecycle spec `spx/34-verification.enabler/32-verify.enabler/verify.md`, and the
> reporter architecture `spx/41-test.enabler/21-typescript-test.enabler/32-journal-reporter.enabler/21-reporter-architecture.adr.md`
> before acting.

## Terminal-status vocabulary: reporter `passed` has no recorder counterpart

The journal reporter yields a terminal status drawn from Vitest's run-end reason —
`passed`, `failed`, or `interrupted` (`JOURNAL_RUN_TERMINAL_STATUS` in
`src/test/languages/journal-reporter.ts`). The recorder's terminal-status vocabulary
`JOURNAL_RUN_STATE_STATUS` (`src/domains/journal/run-state.ts`) is `approved`,
`rejected`, `failed`, `interrupted` — it has no `passed`. The `finish` verb's CLI
handler (`verifyFinishCommand`, `src/commands/verify/cli.ts`) rejects any value
`isVerifyTerminalStatus` (`src/domains/verify/verify.ts`, delegating to
`isJournalRunStateStatus`) does not accept, returning `TERMINAL_STATUS_INVALID`.

The reporter's terminal status is a return value of `runTestsStreaming`, outside the
`TestRunEvidenceSink` port whose producer types the executor already adapts. When this
node's `/apply` wires the reporter's terminal status into `verify.finish`, it must
translate the reporter's vocabulary to a recorder terminal status (a passing test run
to `approved`, or an extension of `JOURNAL_RUN_STATE_STATUS` with a `test`-type-
appropriate success value) rather than passing `passed` straight through, which
`isVerifyTerminalStatus` would reject.

Surfaced by the reporter PR's CI review; the reporter alone does not exercise this path
(no code wires `runTestsStreaming` into `verify.finish` yet), so the resolution belongs
to this node's `/apply`.

## Streaming default run-starter loads the dev-only Vitest Node API at runtime

The TypeScript descriptor's journal-streaming run defaults to the production Vitest
run-starter (`createVitestRunStarter` in `src/test/languages/journal-reporter.ts`),
which loads `vitest/node` through a dynamic import. Wiring the descriptor's streaming
run into the CLI-reachable testing registry brings that module into the packaged
bundle graph, so `tsup.config.ts` externalizes `vitest`/`vitest/node` (never bundled;
resolved at runtime). Vitest is a `devDependency`, so a globally installed `spx` has no
`vitest/node` in its own resolution scope, and ESM resolves the bare specifier relative
to the shipped module, not the invocation cwd.

The reporter and descriptor alone do not exercise this path — no code invokes the
descriptor's `runTestsStreaming` with the default starter in a shipped context yet. When
this node's `/apply` drives the streaming run from `spx verification test run`, it must
make `vitest/node` resolvable at runtime — declare Vitest a runtime dependency, resolve
it from the target product's `node_modules`, or run the streaming run in the target's
own context — rather than relying on the dev-time devDependency.

Surfaced by the descriptor streaming-run PR's packaged build; the resolution belongs to
this node's `/apply`.
