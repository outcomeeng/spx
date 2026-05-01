# Plan: Literal Reuse Remaining Work

## Output Modes Complete

The literal output-mode work is specified, tested, and implemented:

- `--kind <reuse|dupe>` filters problems before formatting, JSON output, and exit-code calculation
- `--files-with-problems` prints unique affected file paths
- `--literals` prints unique problem literal values
- `--verbose` groups problems by kind with file and line detail
- default text output uses parseable `[kind] "value" path:line` lines

## Remaining from Incorporated Session 2026-04-25_23-58-44

These items predate the output-mode work:

- **False-positive bugs** — three classes were identified empirically against real project output; details were lost with the prior session context. Re-run the detector against this codebase, reproduce each false positive, and fix the detector with tests.
- **Escape hatch** — add an environment variable and CLI flag to disable or override literal detection. The earlier scope was `validation all`, not the `literal` subcommand. Invoke `/contextualizing spx/41-validation.enabler/21-validation-cli.enabler` before designing this path.

## Validation

- `spx validation all`
- `pnpm test`

## Commit

Invoke `/spec-tree:committing-changes`.
