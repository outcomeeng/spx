# Audit CLI Domain

## Purpose

This decision governs the Commander.js domain module that registers `spx audit` and its `verify` subcommand, routing CLI invocations to the verify pipeline.

## Context

**Business impact:** The audit CLI domain is the user-facing entry point for `spx audit verify`. It wires the verify pipeline into Commander.js and handles output formatting and process exit codes. All audit business logic lives in child enablers; this module is routing only.

**Technical constraints:** The project CLI uses Commander.js with a `Domain` interface (`{ name, description, register(program) }`). The root `cli.ts` calls `domain.register(program)` for each registered domain. The verify pipeline (`runVerifyPipeline`) is async; the Commander action handler must be async. `process.exit` terminates the process; the action handler calls it after the pipeline completes.

## Decision

The audit CLI splits across three layers per [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md):

1. `src/interfaces/cli/audit.ts` exports `auditDomain: Domain` — the Commander.js domain object with `name: "audit"`. Its `register` method adds the `audit` command group to the root program and registers the `verify <file>` subcommand under it. The Commander action handler imports `runVerifyCommand` from `@/commands/audit/verify` and calls it with `console.log` and `process.cwd()`, then passes the returned exit code to `process.exit`.

2. `src/commands/audit/verify.ts` exports `runVerifyCommand(filePath: string, productDir: string, writeLine: (line: string) => void): Promise<0 | 1>` — the process-agnostic command handler. It calls `runVerifyPipeline`, writes output via `writeLine`, and returns the exit code without calling `process.exit`.

3. `src/cli.ts` imports `auditDomain` from `@/interfaces/cli/audit` and registers it alongside the other domains.

Output behavior: when `exitCode` is `0`, `writeLine` is called once with the verdict value (`APPROVED` or `REJECT`). When `exitCode` is `1`, `writeLine` is called once per defect line.

## Rationale

Extracting `runVerifyCommand` with a `writeLine` callback keeps the testable logic separate from `process.exit`. Tests call `runVerifyCommand` with a collector array and never touch the process lifecycle.

Placing output formatting in `runVerifyCommand` rather than the Commander action keeps the action handler a thin dispatcher: parse args → call command function → exit. This pattern is consistent with how other domains are structured.

Printing the verdict value (`APPROVED`/`REJECT`) on success lets callers know the audit outcome at a glance; the empty lines array from the pipeline is not printed since it carries no user-visible information.

## Trade-offs accepted

| Trade-off                                 | Mitigation / reasoning                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| `writeLine` DI rather than direct I/O     | Enables l1 testing without process-level harness or stdout mocking                  |
| `process.cwd()` used as product directory | Correct for CLI context; tests pass a temp directory directly to `runVerifyCommand` |

## Invariants

- `auditDomain.name === "audit"`
- `runVerifyCommand` never calls `process.exit`
- The Commander action is the only caller of `process.exit`

## Compliance

### Recognized by

A `Domain` object is exported and registered in `cli.ts`. An `audit verify <file>` invocation reaches the verify pipeline without the CLI module containing validation logic.

### MUST

- Export `auditDomain` with `name: "audit"` ([review])
- Register `verify <file>` as a subcommand of `audit` ([review])
- Print the verdict value on success and defect lines on failure ([review])

### NEVER

- Implement audit validation logic in the CLI domain — routing and output only ([review])
- Call `process.exit` inside `runVerifyCommand` ([review])
