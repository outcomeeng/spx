# Verification

PROVIDES typed verification-run infrastructure — the `spx verify` changeset lifecycle over deterministic verification-context materialization and an append-only run-journal substrate whose backend binds at the edge
SO THAT CI jobs, deterministic launchers, and the verification skills an agent executes
CAN reconstruct a verification subject and predicate, stream typed run progress and findings to a backend the environment selects, resume and render the run from its journal, and observe the run incrementally and identically on local and pull-request surfaces without spx spawning a verifier

## Assertions

### Scenarios

- Given a verification subject, predicate, requested workflow, launch context, and persistence intent, when a caller creates a verification context, then spx persists a canonical immutable context document and reports its path and digest ([test](21-verification-context.enabler/tests/verification-context-cli.scenario.l1.test.ts))

### Compliance

- ALWAYS: a verification context is pre-execution input — it records the verification subject, reconstruction fields, predicate, requested workflow, launch context, and persistence intent, and excludes runtime status, terminal verdict, cost, and activity trace ([test](21-verification-context.enabler/tests/verification-context-shape.compliance.l1.test.ts))
- ALWAYS: `spx verify` is the public typed lifecycle for scoped verification runs, while `spx journal` and `spx verification-context` remain substrate surfaces for event storage and canonical input materialization ([audit])
- ALWAYS: `spx verify` validates the verification type, scope type, scope identity, append payload, idempotency key, and finding payload before appending durable run evidence ([audit])
- ALWAYS: spx exposes the verify lifecycle and journal substrate for an agent or launcher to call; spx never spawns, configures, or drives a verification agent ([audit])
- ALWAYS: the channel binds its backend at the edge from the environment — a local file-and-standard-output backend by default, a GitHub pull-request backend under continuous integration — without the caller naming the backend ([audit])
- ALWAYS: a run streams to its backend incrementally as events append, so the run is observable before it completes and reads the same on a local surface and a pull-request surface ([audit])
- ALWAYS: deterministic `spx validation` and `spx test` remain their own top-level subcommands because spx performs that work directly, while verification run types that record scoped agentic evidence route through `spx verify` ([audit])
- NEVER: spx exposes a verification-type top-level subcommand such as `spx audit` or `spx review` ([audit])
