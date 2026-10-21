# Slot Command

PROVIDES the `spx slot` command family — `spx slot run` and `spx slot status` over the host-wide build slot
SO THAT operators, automation, CI jobs, git hooks, and agents
CAN run a command under the slot and inspect who holds it and who waits

## Assertions

- Given `spx slot run [--] <command> [args...]`, when the request is admitted, then the command runs with standard input, output, and error attached, and `spx` exits with the command's exit status, or with 128 plus the signal number when a signal ends the command
- Given `spx slot run` with no command operand, then it exits non-zero and names the missing command
- Given `spx slot status`, then it reports the holder and at most 10 waiting requests in arrival order and states how many more wait; `--all` lists every waiting request, and `--json` emits one document holding `holder` (or `null`), `waiting`, and `omitted`, each request carrying its `ticket`, `pid`, `command`, `productDir`, and `since`, per [spx/60-surfaces.enabler/21-cli-surface.enabler/11-cli-surface.pdr.md](spx/60-surfaces.enabler/21-cli-surface.enabler/11-cli-surface.pdr.md)
- ALWAYS: `slot` is a noun group, and `run` and `status` are intent verbs that each document their invocation shape, options, and diagnostics in `--help`
