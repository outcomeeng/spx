# Execute-Run Command Surface Architecture

The `spx verification <type> run [paths…]` command paths are registered by the single `spx verification` Commander descriptor of `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler`, wiring each verification type as a noun command that carries a `run` verb per `spx/14-cli-composition.adr.md`. A process-agnostic execute-run handler under `src/commands/verification-exec/` composes the spx-driven executor of `spx/34-verification.enabler/43-execute.enabler` — resolving the type's streaming runner through that node's verification-type registry, backing it with production recorder operations over the effective invocation directory, and forwarding the verb's positional operands as the run's scope paths — and returns the run locator and terminal status as a structured result. The descriptor owns Commander wiring and the process boundary; the handler owns composition and returns a result; neither the handler nor any other `src/commands/verification-exec/` module imports Commander or writes to the process boundary.

## Rationale

The caller-driven `spx verification run <verb>` surface and the spx-driven `spx verification <type> run` surface are two shapes of one command family, so `spx/14-cli-composition.adr.md` places both on the single `verification` descriptor: the composition root registers each domain at the root program, and a second descriptor cannot attach subcommands to the first descriptor's `verification` command. The recorder/executor split therefore lives at the `commands/` layer — the record-run handlers under `src/commands/verify/` and the execute-run handler under `src/commands/verification-exec/`, both imported by the one descriptor — not by splitting the descriptor.

Keeping the execute-run handler free of Commander and the process boundary lets it verify with an injected executor and recorder-operations factory against controlled implementations, without a real Vitest run, journal I/O, or a built executable — the executor of `spx/34-verification.enabler/43-execute.enabler` is already a pure composition over injected recorder operations and a runner resolver, and the handler extends that injection to its own boundary. Resolving the type's runner through the verification-type registry rather than naming a language keeps the command surface language-neutral per `spx/19-language-registration.adr.md`: the surface asks for the `test` type's runner and the registry returns the TypeScript-hosted streaming runner without the surface importing it. Forwarding the verb's positional operands as the run's scope paths realizes the shared path-operand vocabulary of `spx/29-verification-path-scope.pdr.md` rather than a verification-type-specific `--files` flag.

## Invariants

- The execute-run handler's durable effects flow only through the injected executor and recorder-operations factory; the handler constructs no journal event and performs no Commander or process I/O.
- The command's positional operands reach the executor as the run's scope paths without a scope-naming flag.
- Exactly one Commander descriptor registers the whole `spx verification` command family, wiring the record-run handlers of `src/commands/verify/` and the execute-run handler of `src/commands/verification-exec/`.

## Verification

### Audit

- ALWAYS: the execute-run handler accepts the executor, the recorder-operations factory, the runner resolver, and the effective invocation directory through injected parameters, so it verifies with controlled implementations without Commander, process, or journal I/O ([audit])
- ALWAYS: the single `spx verification` descriptor of `spx/14-cli-composition.adr.md` wires the execute-run handler, which lives under `src/commands/verification-exec/`; no second descriptor attaches the verification-type command paths to the `verification` command ([audit])
- ALWAYS: the handler resolves the type's streaming runner through the verification-type registry of `spx/34-verification.enabler/43-execute.enabler` and forwards the command's positional operands to the executor as the run's scope paths per `spx/29-verification-path-scope.pdr.md`, so the command surface names no language per `spx/19-language-registration.adr.md` ([audit])
- NEVER: a module under `src/commands/verification-exec/` imports Commander or writes to the process boundary — `process.exit`, `process.stdout`, `process.stderr`, `process.stdin` — that boundary belongs to the descriptor per `spx/14-cli-composition.adr.md` ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or module replacement substitutes for the handler's injected executor, recorder-operations factory, or runner resolver — the handler receives controlled implementations through its public parameters ([audit])
