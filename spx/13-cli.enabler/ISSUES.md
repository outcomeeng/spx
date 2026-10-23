# Known Issues

## The CLI write boundary still accepts unescaped strings

`CliIo.writeStdout` and `CliIo.writeStderr` in `src/interfaces/cli/product-context.ts` take a plain `string`, so the type system permits a caller to hand raw external text to a process stream. Narrowing both to the composed `TerminalText` of `src/lib/terminal-text/` would make [`spx/13-cli.enabler/15-cli-architecture.adr.md`](15-cli-architecture.adr.md)'s escaping invariant unbypassable rather than merely stated.

**Impact:** the invariant is currently enforced by review rather than by the compiler. Until the signature narrows, a new write site can skip composition without any gate objecting.

**Blocked by:** narrowing the signature breaks every unmigrated write site at once. Sixteen nodes still pass raw strings and each carries its own `ISSUES.md` entry naming its sites — among them `spx/41-validation.enabler/21-validation-cli.enabler`, `spx/36-session.enabler/76-session-cli.enabler`, `spx/60-surfaces.enabler/21-cli-surface.enabler/21-journal.enabler`, and `spx/46-agent.enabler/21-resume.enabler`. This node cannot close the boundary alone.

**Resolution:** after those nodes migrate to `src/lib/terminal-text/`, narrow both `CliIo` write signatures to `TerminalText`, unwrap once inside `DEFAULT_CLI_IO`, and add the compliance assertion and evidence that no write site accepts an unescaped string.

**Skills:** `/apply`, `/author-typescript-test`, `/audit-typescript-code`.

**Revisit condition:** once the per-node terminal-escaping issues are cleared.

## Relayed documents still travel through the composed-text write

[`spx/13-cli.enabler/15-cli-architecture.adr.md`](15-cli-architecture.adr.md) names a relayed document — agent-authored release notes, a session file's own content, a subprocess's own output — as the case for the pass-through channel that `CliIo.writePassThrough` and `CliIo.writePassThroughError` now carry. The descriptors that relay such documents still hand them to the composed-text write:

- `src/interfaces/cli/session.ts:87` — `spx session show` writes the session file's content through `writeStdout`
- `src/interfaces/cli/compact.ts:62` — the compact command writes its result through `writeStdout`
- `src/interfaces/cli/spec.ts:61` — `spx spec context` hands the context bundle, whose document content is the exact bytes of each read spec, decision, and methodology file, to `writeStdout` through the shared `writeOutput` helper; the `spx spec status` and `spx spec next` reports that share the helper are composed and stay on the composed-text write
- `src/interfaces/cli/agent.ts:242`, `:246`, and `:280` — the resume JSON and list output and the search output reach `writeStdout` through the shared `writeOutput` helper; the composed diagnostics that share `writeError` (`:130`, `:191`, `:228`) are the product's own speech and stay on the composed-text write

**Impact:** none observable today, because both writes take a plain `string` and reach one stream; the channel a command selects states which of the two claims its output makes, and these sites state the wrong one.

**Resolution:** each owning node migrates its descriptor to select the pass-through channel for the document it relays and the composed-text write for the report it composes — `spx/36-session.enabler/76-session-cli.enabler`, `spx/37-compact.enabler`, `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler`, `spx/46-agent.enabler/21-resume.enabler`, and `spx/46-agent.enabler/32-search.enabler` — under the same per-node migration that clears the write-boundary entry above.

**Skills:** `/apply`, `/audit-typescript-code`.

**Revisit condition:** once the per-node terminal-escaping issues are cleared.

## The session descriptor renders a doubled `Error:` prefix for base-class errors

The caught-error branch at `src/interfaces/cli/session.ts:381` composes a literal `Error:` prefix around a message that already interpolates `error.name`, so a plain `Error` renders `Error: Error: <message>`, shaped `` `Error: ${error.name}: ${error.message}` ``. The `error.name` clause carries information only for a subclass such as `TypeError`; for the base class it repeats the literal. The second site is `formatError` composed by `handleError` in `src/interfaces/cli/session.ts` (lines 102-110), where `` `Error: ${formatError(error)}` `` renders `Error: Error: <message>` for a plain `Error` reaching the descriptor's catch-all handler.

**Impact:** every base-class error diagnostic on the session domain reads with a duplicated prefix. Exit code, stream routing, and message content are correct, so no gate objects.

**Resolution:** compose the name segment only when it differs from the literal prefix — emit `error.name` when the error is a subclass and omit it for the base class — and compose the caught message as an external segment through `src/lib/terminal-text/`, then cover the composition with evidence under the node's existing Commander-diagnostics compliance assertion, which already governs what these handlers echo to stderr.

**Skills:** `/apply`, `/author-typescript-test`, `/audit-typescript-code`.

## The lifecycle signal-to-exit-code mapping keeps its predicate in the harness: spx/13-cli.enabler/tests/lifecycle.mapping.l1.test.ts, the lifecycle signal-to-exit-code mapping, assertion-seam

`spx/13-cli.enabler/tests/lifecycle.mapping.l1.test.ts` only calls `registerLifecycleMappingEvidence()`. The `describe`/`it` blocks, the `signalCases` table, and every `expect` live in `testing/harnesses/process-lifecycle/mapping.ts`, so the predicate and its cases sit in test infrastructure instead of the linked test.

**Impact:** the executed test file owns no assertion, so the audit cannot judge the predicate from the file the spec links.

**Resolution:** the linked test file declares the cases and every `expect`, and the harness supplies only resources and doubles.

**Skills:** `/apply`, `/author-typescript-test`, `/audit-typescript-test`.

**Revisit condition:** when the node's lifecycle evidence is next changed.

## The managed-subprocess stdio rule keeps its expectations in the harness: spx/13-cli.enabler/tests/lifecycle.compliance.l1.test.ts, managed long-running subprocesses expose parent-piped stdout and stderr, assertion-seam

`spx/13-cli.enabler/tests/lifecycle.compliance.l1.test.ts` only calls `registerLifecycleComplianceEvidence()`. The `expect` calls over the `stdio` value `pipe`, the output chunks, and the diagnostics live in `testing/harnesses/process-lifecycle/compliance.ts`.

**Impact:** the executed test file owns no assertion, so the audit cannot judge the compliance predicate from the file the spec links.

**Resolution:** the linked test file declares the violating fixtures and every `expect`, and the harness supplies only resources and doubles.

**Skills:** `/apply`, `/author-typescript-test`, `/audit-typescript-test`.

**Revisit condition:** when the node's lifecycle evidence is next changed.

## The registry properties call fast-check directly and own their generator domain: spx/13-cli.enabler/tests/lifecycle.property.l1.test.ts, registry conservation, missing property seed reporting

`spx/13-cli.enabler/tests/lifecycle.property.l1.test.ts` calls `fc.assert` directly and declares `registryOpArbitrary`, `childPoolSize`, `maxOperationCount`, `maxHandlerInvocations`, and `maxSpawnCount` itself. It uses no seed-reporting property harness, so a failing run carries no replay seed. The cleanup-idempotence and spawn-registration properties in the same file share the defect.

**Impact:** a failing property run cannot be replayed from its output, and the generator domain sits in the assertion file.

**Resolution:** the generator domain moves to `testing/generators/` and each property runs through the seed-reporting property harness with `assertProperty`.

**Skills:** `/apply`, `/author-typescript-test`, `/audit-typescript-test`.

**Revisit condition:** when the node's lifecycle evidence is next changed.

## The foreground-handoff scenario draws its listeners without a pinned seed: spx/13-cli.enabler/tests/foreground-handoff.scenario.l1.test.ts, a signal target holding the parent's SIGINT and SIGTERM listeners, test-owned configuration

`spx/13-cli.enabler/tests/foreground-handoff.scenario.l1.test.ts` draws through a local `sample()` helper and `generatedListeners()` over `fc.sample` with no pinned seed, so the case differs per run and cannot be replayed from a failure report.

**Impact:** a failing draw in the foreground-handoff scenario carries no replay path.

**Resolution:** the scenario draws through `sampleGeneratedValue` from `testing/generators/sample.ts`, which owns the seed.

**Skills:** `/apply`, `/author-typescript-test`, `/audit-typescript-test`.

**Revisit condition:** when the node's foreground-handoff evidence is next changed.

## The guarded-supervision case never reaches the production wiring: `spx/13-cli.enabler/tests/guarded-supervision.scenario.l1.test.ts` `never holds the child in the lifecycle registry` `spx/13-cli.enabler/cli.md`

The case `never holds the child in the lifecycle registry` samples `lifecycleRegistry.size` around a supervisor built over a recording spawn double that never receives the registry. The sizes are 0 whatever production does: routing the production `guardedSupervisor` through `lifecycleProcessRunner` would leave the test green, because `createProcessGuardedSupervisor` and `guardedSpawn` in `src/lib/process-lifecycle/install.ts` are never exercised. The stream and descriptor assertions are likewise checked only through the recorded spawn options. The production adapters that signal the group (`process.kill(-pid, signal)`) and close the real descriptor are not reached.

**Impact:** the guarded-supervision assertions of [spx/13-cli.enabler/cli.md](spx/13-cli.enabler/cli.md) are unevidenced against the production wiring: registering the child or signalling a single process instead of its group passes the suite.

**Resolution:** exercise the production `guardedSupervisor` and `guardedSpawn` wiring through injected process primitives, so that a registered child or a non-group signal fails the test. Nothing in the suite starts a real process, takes a real lock, or sends a real signal.

**Skills:** `/apply`, `/author-typescript-test`, `/audit-typescript-test`.

**Revisit condition:** when the node's guarded-supervision evidence is next changed.
