# Verification

PROVIDES type-agnostic verification infrastructure — deterministic verification-context materialization and an append-only run-journal channel whose backend binds at the edge — that external launchers and agents drive for one verification request and run
SO THAT CI jobs, deterministic launchers, and the verification skills an agent executes
CAN reconstruct a verification subject and predicate, persist and stream the resulting run's events to a backend the environment selects, and observe the run incrementally and identically on local and pull-request surfaces without spx spawning a verifier or carrying a verification-type vocabulary

## Assertions

### Scenarios

- Given a verification subject, predicate, requested workflow, launch context, and persistence intent, when a caller creates a verification context, then spx persists a canonical immutable context document and reports its path and digest ([test](21-verification-context.enabler/tests/verification-context-cli.scenario.l1.test.ts))

### Compliance

- ALWAYS: a verification context is pre-execution input — it records the verification subject, reconstruction fields, predicate, requested workflow, launch context, and persistence intent, and excludes runtime status, terminal verdict, cost, and activity trace ([test](21-verification-context.enabler/tests/verification-context-shape.compliance.l1.test.ts))
- ALWAYS: the run-journal channel is type-agnostic — a verification kind is an opaque scope label the caller supplies, and spx carries no `audit`, `review`, or other verification-type vocabulary ([audit])
- ALWAYS: spx exposes the journal channel for an agent to call; spx never spawns, configures, or drives a verification agent ([audit])
- ALWAYS: the channel binds its backend at the edge from the environment — a local file-and-standard-output backend by default, a GitHub pull-request backend under continuous integration — without the caller naming the backend ([audit])
- ALWAYS: a run streams to its backend incrementally as events append, so the run is observable before it completes and reads the same on a local surface and a pull-request surface ([audit])
- ALWAYS: deterministic verification kinds remain their own `spx` subcommands because spx performs that work, while agentic kinds carry no `spx` subcommand because the agent performs the work and drives the journal channel ([audit])
- NEVER: spx exposes a verification-type subcommand such as `spx audit` or `spx review` — the agentic kinds route through the one type-agnostic journal channel ([audit])
