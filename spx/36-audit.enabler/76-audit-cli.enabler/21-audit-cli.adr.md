# Audit CLI Domain

The `spx audit` Commander domain follows the three-layer CLI composition of [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md): the descriptor at `src/interfaces/cli/audit.ts` is routing and the process boundary only — every subcommand delegates to a process-agnostic handler under `src/commands/audit/` that returns its result, and the Commander action is the sole caller of `process.exit`. The static CLI descriptor registry enumerates the audit domain exactly when audit exposes an implemented subcommand; a domain with no implemented subcommand is absent from the registry rather than registered as an empty command group.

## Rationale

Keeping audit subcommand logic in process-agnostic handlers under `src/commands/audit/` and the process boundary in the Commander action keeps each handler testable with a collector for output and an exit code in the return value, never `process.exit` — consistent with every other domain and with `spx/14-cli-composition.adr.md`. Enumerating a domain in the registry only once it exposes an implemented subcommand keeps `spx audit --help` from advertising a command group that does nothing: a registered descriptor with no action is a dead entry the static registry would otherwise carry into the build.

## Invariants

- `auditDomain.name === "audit"`.
- No handler under `src/commands/audit/` calls `process.exit`; the Commander action is the only caller.
- The static CLI descriptor registry enumerates the audit domain only when audit exposes at least one implemented subcommand.

## Verification

### Audit

- ALWAYS: keep `src/interfaces/cli/audit.ts` routing and process I/O only — exit codes and standard streams — with all audit logic in child enabler handlers per `spx/14-cli-composition.adr.md` ([audit])
- ALWAYS: expose each audit subcommand as a process-agnostic handler under `src/commands/audit/` that emits output through an injected writer and returns its exit code ([audit])
- ALWAYS: enumerate the audit domain in the static CLI descriptor registry only when it exposes an implemented subcommand ([audit])
- NEVER: implement audit business logic in the CLI descriptor — routing and output only ([audit])
- NEVER: call `process.exit` inside an audit command handler — the Commander action is the only caller ([audit])
- NEVER: register an audit command group that exposes no implemented subcommand ([audit])
