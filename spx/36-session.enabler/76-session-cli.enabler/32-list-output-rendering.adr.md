# List-Output Rendering

The non-interactive `spx session list` and `spx session todo` text output is produced by a pure formatter in the session domain that receives a resolved color boolean and a terminal width as parameters and applies styling through a chalk instance whose color level is fixed from that boolean. The descriptor resolves the color decision from `process.stdout.isTTY`, `NO_COLOR`, and the `--color`/`--no-color` flags, reads the terminal width, and writes the formatter's string to standard output; chalk's environment-based color auto-detection is never invoked. The `--json`/`--fields` projection never passes through this formatter. This applies [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md) to terminal styling, mirroring the handler-resolves-facts, pure-formatter, descriptor-writes split of [`spx/36-session.enabler/76-session-cli.enabler/21-handoff-base-rendering.adr.md`](21-handoff-base-rendering.adr.md).

## Rationale

A styling library that auto-detects color support from the environment makes the formatter's output depend on ambient process state, which breaks the pure-function contract [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md) reserves for the domain layer and makes `l1` verification of styling impossible — the same output would carry escapes under a TTY and none under a pipe with no parameter changing. Constructing the chalk instance with its level fixed from an injected boolean keeps the formatter a deterministic function of its inputs, so styling and truncation verify over supplied values without a terminal. TTY detection, `NO_COLOR` reads, and flag parsing are process I/O the descriptor owns; routing the resolved boolean and width down as parameters is the layering already established for the refusal checklist.

Rejected: letting chalk auto-detect color (couples the formatter to the environment and forfeits deterministic `l1` styling verification); reading `process.stdout.isTTY` inside the formatter (drags process I/O into the pure layer against [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md)); a second styling dependency when chalk is already declared; and routing the JSON projection through the styling formatter (the machine-readable path must carry no escapes or truncation).

## Invariants

- The session-line formatter's output is a deterministic function of its `(sessions, color, width)` inputs — equal inputs yield byte-equal output.
- With color disabled, the formatter output contains no ANSI escape sequence.
- Every session line the formatter renders has an escape-stripped display width no greater than the supplied width. Status headers are short fixed labels, not subject to width truncation.

## Verification

### Audit

- ALWAYS: the non-interactive list/todo text formatter is a pure function in `src/domains/session/` that accepts the resolved color boolean and terminal width as parameters per [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md) ([audit])
- ALWAYS: the chalk instance the formatter styles through is constructed with its color level fixed from the passed color boolean, so styling consults no environment state ([audit])
- ALWAYS: the descriptor `src/interfaces/cli/session.ts` resolves the color decision from `process.stdout.isTTY`, `NO_COLOR`, and the `--color`/`--no-color` flags, reads the terminal width, and writes the formatted string to standard output ([audit])
- NEVER: the formatter or any `src/domains/session/` module reads `process.stdout.isTTY`, `process.env`, or `NO_COLOR`, or invokes chalk's environment-based color auto-detection ([audit])
- NEVER: the `--json`/`--fields` output path passes through the styling formatter — the JSON projection carries no styling and no truncation ([audit])
- NEVER: `vi.mock()` or `jest.mock()` substitutes for the color or width inputs — the formatter and the color resolver exercise injected values ([audit])
