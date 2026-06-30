# spx

## Why this product exists

Outcome Engineering requires agents that follow the methodology — ingesting spec-tree context, respecting truth hierarchy, executing quality gates, journaling agentic verification runs, managing harness environment configuration, and preserving session continuity. spx is the deterministic harness that turns those methodology operations into configured local commands.

## Consumers and jobs

| Consumer / persona               | Job to be done                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Outcome Engineering practitioner | Run methodology operations quickly and repeatably inside a product repository                            |
| Coding agent or launcher         | Load context, execute quality gates, record verification runs, and resume agent-native sessions          |
| Continuous-integration workflow  | Validate the product tree and publish verification, validation, and test results to the selected backend |

## Surfaces

- `spx` CLI - practitioners, agents, launchers, and CI workflows run deterministic methodology commands
- `spx.config.{toml,json,yaml}` - product repositories declare harness, validation, testing, language, and session configuration
- Tracked `spx/` tree - practitioners and agents read durable product truth, decisions, specs, tests, and coordination notes
- Shared `.spx/` state - commands persist branch, session, worktree, and run-journal state for local workflows
- Backend outputs - CI workflows publish rendered results to local output, pull-request comments, merge-request notes, or observability sinks

## Actors and sidedness

spx is a single-party product repository tool. It coordinates local practitioners, coding agents, launchers, and CI workflows around one tracked product tree.

- Practitioner - supplies product intent and inspects deterministic command output
- Coding agent or launcher - invokes commands and follows the configured harness contract
- CI workflow - runs configured gates and publishes rendered results
- Backend target - receives rendered verification, validation, or test output

## Product hypothesis

WE BELIEVE THAT providing a deterministic agent harness for Outcome Engineering — context ingestion, spec-tree execution, harness environment management, validation, and session management
WILL cause practitioners to trust AI agents to follow the methodology, keeping agents on the rails instead of drifting from specs, quality gates, verification run records, or configured agents
CONTRIBUTING TO higher engineering velocity — teams ship quality code faster because the methodology overhead drops from minutes to milliseconds

### Evidence of success

| Metric                         | Current                       | Target                         | Measurement approach                                                      |
| ------------------------------ | ----------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| Agent methodology drift        | Frequent (no guardrails)      | Rare (harness enforces)        | Count spec violations per agent session                                   |
| Quality gate coverage          | Manual (developer remembers)  | Automatic (spx executes gates) | % of commits passing configured spx execution gates                       |
| Verification run observability | Result revealed at end of run | Streamed incrementally         | Count agentic verification runs streamed to their backend as they advance |
| Harness environment drift      | Manual config edits           | Configured and reproducible    | Count configured-agent files reconciled from configured state             |
| Session context loss           | Common (manual file handoffs) | Eliminated (CLI handoffs)      | Count context-loss incidents per week                                     |
| Methodology operation latency  | Minutes (LLM-based scanning)  | Milliseconds (deterministic)   | Benchmark CLI command execution time                                      |

## Scope

### What's included

- Code validation — configured source, formatting, test, dependency, documentation, and unused-code quality gates across project languages
- Deterministic context ingestion — spec-tree context loading from product root, ancestor specs, decisions, lower-index siblings, tests, and escape hatches without LLM inference
- Spec-tree execution — config-driven execution of deterministic testing and validation governed by `spx.config.{toml,json,yaml}`, with persisted state for fast status reporting, and a typed `spx verify` lifecycle agents and launchers drive to record, stream, validate, resume, and render verification runs through the journal substrate
- Result delivery — kind-agnostic, idempotent publication of a rendered verification, validation, or test result to the environment-bound backend (a local output target, a GitHub pull-request comment, a GitLab merge-request note, or an observability sink), so consumers deliver results without holding backend-specific I/O
- Harness environment management — deterministic management of `AGENTS.md`, Claude Code and Codex configuration, configured plugin marketplaces, plugins, and skills for configured agents
- Agent session coordination — discovery and resume launch for Codex and Claude Code agent sessions from the SPX CLI, distinct from SPX handoff session files
- Session management — work handoffs between agent contexts with priority ordering
- Release — per-release generation of release notes and documentation updates from the product's git history, plus governed, provenance-bearing publication

### What's excluded

| Excluded item          | Rationale                                                               |
| ---------------------- | ----------------------------------------------------------------------- |
| Hosted agent execution | spx governs repository-local commands and state, not remote agent hosts |
| General task tracking  | Product truth, coordination notes, and session files carry spx work     |
| Model inference        | Deterministic operations stay outside LLM inference                     |

## Product-level assertions

### Compliance

- ALWAYS: complete any CLI command in <100ms once the CLI process is running — agents depend on deterministic response times; this excludes Node.js process startup ([audit])
- ALWAYS: ingest spec-tree context deterministically from the tracked `spx/` tree, root decisions, ancestor specs, lower-index siblings, co-located evidence links, and node-local escape hatches ([audit])
- ALWAYS: govern spec-tree deterministic testing and validation through `spx.config.{toml,json,yaml}` rather than ad hoc files or command-local policy ([audit])
- ALWAYS: persist spec-tree execution state so status commands can report last-run results and staleness without re-running the configured execution ([audit])
- ALWAYS: provide a typed `spx verify` lifecycle agents and launchers drive to record and stream verification runs, persisting each run's append-only event journal under `.spx/branch/{branch-slug}/` and validating the run type, scope, and finding payload before recording durable evidence ([audit])
- ALWAYS: deliver a rendered verification, validation, or test result to the environment-bound backend, upserting one backend target per marker and naming no result kind, so consumers publish results without holding backend-specific I/O ([audit])
- ALWAYS: manage harness environment configuration deterministically, including `AGENTS.md`, Claude Code and Codex configuration, configured plugin marketplaces, plugins, and skills for configured agents ([audit])
- ALWAYS: resolve product root via `git rev-parse` with fallback to `$PWD` — consistent behavior across worktrees and subdirectories ([audit])
- NEVER: require network access for core operations — offline-first for development environments ([audit])
- NEVER: use LLM inference for operations that can be computed deterministically — tokens are for decisions, not file scanning ([audit])

## Open decisions

| Decision topic      | Key question                                                       | Options                                                              | Triggers ADR/PDR? |
| ------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- | ----------------- |
| Harness node path   | What path owns harness environment behavior?                       | Keep `spx/33-agent-environment.enabler` / rename through `/refactor` | yes               |
| Adapter boundary    | Which source modules should carry `AgentAdapter` naming?           | Existing agent modules / extracted adapter modules                   | yes               |
| Session accumulator | Which agent-session identity fields should session claims persist? | Environment-derived id only / explicit normalized field              | yes               |
