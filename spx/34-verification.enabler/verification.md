# Verification

PROVIDES a type-agnostic run-journal channel — append-only event-journal verbs whose backend binds at the edge — that an external agent drives to record and stream one agentic verification run
SO THAT the verification skills an agent executes, and any future agentic verification kind
CAN persist a changeset-scoped run's events to a backend the environment selects — local run-journal files and standard output on a developer checkout, GitHub Snapshot persistence and a pull-request comment under continuous integration — and observe the run incrementally and identically on both surfaces, without naming a backend or carrying a verification-type vocabulary into spx

## Assertions

### Compliance

- ALWAYS: the run-journal channel is type-agnostic — a verification kind is an opaque scope label the caller supplies, and spx carries no `audit`, `review`, or other verification-type vocabulary ([audit])
- ALWAYS: spx exposes the journal channel for an agent to call; spx never spawns, configures, or drives a verification agent ([audit])
- ALWAYS: the channel binds its backend at the edge from the environment — a local file-and-standard-output backend by default, a GitHub pull-request backend under continuous integration — without the caller naming the backend ([audit])
- ALWAYS: a run streams to its backend incrementally as events append, so the run is observable before it completes and reads the same on a local surface and a pull-request surface ([audit])
- ALWAYS: deterministic verification kinds remain their own `spx` subcommands because spx performs that work, while agentic kinds carry no `spx` subcommand because the agent performs the work and drives the journal channel ([audit])
- NEVER: spx exposes a verification-type subcommand such as `spx audit` or `spx review` — the agentic kinds route through the one type-agnostic journal channel ([audit])
