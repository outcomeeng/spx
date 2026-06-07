# Audit CLI Domain

The `spx audit` Commander domain follows the three-layer CLI composition of [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md). The domain is routing and output only — all audit validation logic lives in the child enablers.

## Rationale

Extracting the command handler behind a `writeLine` callback keeps the testable logic separate from `process.exit`, so tests drive it with a collector array and never touch the process lifecycle. Keeping output formatting in the handler rather than the Commander action leaves the action a thin dispatcher — parse args, call the handler, exit — consistent with the other domains. The handler takes `productDir` as a parameter so it carries no implicit dependency on the working directory. Printing the verdict value on success lets callers see the outcome at a glance, and the pipeline's empty `lines` array is not printed because it carries no user-visible information.

## Invariants

- `auditDomain.name === "audit"`.
- `runVerifyCommand` never calls `process.exit`.
- The Commander action is the only caller of `process.exit`.

## Verification

### Audit

- ALWAYS: export `auditDomain` from `src/interfaces/cli/audit.ts`, register it through `src/cli.ts`, and add `verify <file>` as its subcommand ([audit])
- ALWAYS: expose the process-agnostic handler `runVerifyCommand(filePath, productDir, writeLine): Promise<0 | 1>` in `src/commands/audit/verify.ts`, emitting each output line through `writeLine` and returning the exit code ([audit])
- ALWAYS: the Commander action handler in `src/interfaces/cli/audit.ts` passes `process.cwd()` as `productDir` when calling `runVerifyCommand` ([audit])
- ALWAYS: print the verdict value (`APPROVED`/`REJECT`) on success and one line per defect on failure ([audit])
- NEVER: implement audit validation logic in the CLI domain — routing and output only ([audit])
- NEVER: call `process.exit` inside `runVerifyCommand` — the Commander action is the only caller of `process.exit` ([audit])
