# Verification

PROVIDES typed verification-run infrastructure over deterministic verification-context materialization and an append-only run-journal substrate whose backend binds at the edge
SO THAT CI jobs, deterministic launchers, and the verification skills an agent executes
CAN reconstruct a verification subject and predicate, stream typed run progress and findings to a backend the environment selects, resume and render the run from its journal, and observe the run incrementally and identically in local output and pull-request comments without spx implementing a verification agent

## Assertions

### Scenarios

- Given a verification subject, predicate, requested workflow, launch context, and persistence intent, when a caller creates a verification context, then spx persists a canonical immutable context document and reports its path and digest ([test](21-verification-context.enabler/tests/verification-context-cli.scenario.l1.test.ts))

### Compliance

- ALWAYS: a verification context is pre-execution input — it records the verification subject, reconstruction fields, predicate, requested workflow, launch context, and persistence intent, and excludes run status, terminal verdict, cost, and activity trace ([test](21-verification-context.enabler/tests/verification-context-shape.compliance.l1.test.ts))
- ALWAYS: typed verification runs use verification-context materialization and the run-journal substrate, while CLI commands that expose those capabilities are governed by `spx/60-surfaces.enabler/21-cli-surface.enabler` ([audit])
- ALWAYS: verification-run lifecycle operations validate the verification type, scope type, scope identity, evidence payload, idempotency key, terminal status, and finding payload before recording durable run evidence ([audit])
- ALWAYS: spx exposes the verify lifecycle and journal substrate for whichever party drives a run — an agent, a launcher, or spx itself — to record through ([audit])
- NEVER: spx implements a verification agent — an agentic verification is judged by an agent the agent harness launches and configures, per `spx/12-agent-harness.pdr.md` ([audit])
- ALWAYS: the channel binds its backend at the edge from the environment — a local file-and-standard-output backend by default, a GitHub pull-request backend under continuous integration — without the caller naming the backend ([audit])
- ALWAYS: a run streams to its backend incrementally as events append, so the run is observable before it completes and reads the same in local output and a pull-request comment ([audit])
- ALWAYS: a verification run records its scope and finding evidence in the run journal whether a caller drove it or spx executed it, so the substrate carries every verification type's evidence rather than one verdict mode's ([audit])
- ALWAYS: a verification spx executes is exposed through the verification command surface as a verification-type command path, governed by `spx/60-surfaces.enabler/21-cli-surface.enabler` ([audit])
- NEVER: spx exposes a verification-type top-level subcommand such as `spx audit` or `spx review` ([audit])
