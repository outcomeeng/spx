# spx

## Why this product exists

Outcome Engineering requires agents that follow the methodology — ingesting spec-tree context, respecting truth hierarchy, executing quality gates, journaling agentic verification runs, managing harness environment configuration, and preserving session continuity. spx is the deterministic harness that turns those methodology operations into configured local commands.

## Consumers and jobs

| Consumer / persona                   | Job to be done                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Outcome Engineering practitioners    | Run methodology-governed product work through deterministic local commands instead of manual agent steps. |
| Coding agents                        | Receive product context, execute governed workflows, and preserve handoff context without inference.      |
| CI and release automation            | Validate, test, package, and publish the product through repeatable gates.                                |
| Verification and review participants | Record, inspect, render, and deliver verification run data through typed run lifecycles.                  |

## Surfaces

- CLI — practitioners, coding agents, CI, and release automation invoke deterministic methodology operations.
- MCP, web API, and UI — integration-facing and user-facing interaction boundaries expose SPX capabilities through protocol or visual contracts.

## Delivery Targets

- Local output targets — terminal output and local files deliver deterministic command results to practitioners, agents, and automation.
- GitHub pull-request comments, checks, and release workflow outputs — deliver verification, review, validation, and package-publication results.
- GitLab merge-request notes and observability sinks — deliver verification, review, validation, and package-publication results to non-GitHub integration environments.

## Agent Adapters

- Codex, Claude Code, and Pi adapters — launch and resume supported coding agents, with observation and communication capabilities supplied by each adapter's declared contract.

## Agent Harness Inputs

- Methodology context source/version, agent configuration, instruction files, plugin marketplaces, plugins, skills, invocation policy, and isolated execution state equip supported coding agents through typed product configuration.

## Durable Product Artifacts

- Repository files — product specs, configuration files, and instruction files carry durable map artifacts.
- Local `.spx/` files — session records, run journals, and derived snapshots carry workflow persistence.
- GitHub artifacts and release records — hosted artifacts carry verification, review, validation, and package-publication evidence.

## Actors and sidedness

- Practitioner — provides product intent and receives deterministic command results, review findings, handoffs, and release evidence.
- Coding agent — consumes context and skills, executes product work, records evidence, and returns reviewable changes.
- Repository host — stores git history, pull requests, workflow artifacts, and release records consumed by the harness.
- Package consumer — installs the published CLI and receives the deterministic harness behavior shipped from the product repository.

## Product hypothesis

WE BELIEVE THAT providing a deterministic agent harness for Outcome Engineering — context ingestion, spec-tree execution, harness environment management, validation, and session management
WILL cause practitioners to trust AI agents to follow the methodology, keeping agents on the rails instead of drifting from specs, quality gates, verification run records, or agent selection
CONTRIBUTING TO higher engineering velocity — teams ship quality code faster because the methodology overhead drops from minutes to milliseconds

### Evidence of success

| Metric                         | Current                       | Target                         | Measurement approach                                                      |
| ------------------------------ | ----------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| Agent methodology drift        | Frequent (no guardrails)      | Rare (harness enforces)        | Count spec violations per agent session                                   |
| Quality gate coverage          | Manual (developer remembers)  | Automatic (spx executes gates) | % of commits passing configured spx execution gates                       |
| Verification run observability | Result revealed at end of run | Streamed incrementally         | Count agentic verification runs streamed to their backend as they advance |
| Harness environment drift      | Manual config edits           | Configured and reproducible    | Count agent files reconciled from configured inputs                       |
| Session context loss           | Common (manual file handoffs) | Eliminated (CLI handoffs)      | Count context-loss incidents per week                                     |
| Methodology operation latency  | Minutes (LLM-based scanning)  | Milliseconds (deterministic)   | Benchmark CLI command execution time                                      |

## Scope

### What's included

- Code validation — configured source, formatting, test, dependency, documentation, and unused-code quality gates across product languages
- Deterministic context ingestion — spec-tree context loading from product root, ancestor specs, decisions, lower-index siblings, tests, and escape hatches without LLM inference
- Spec-tree execution — config-driven execution of deterministic testing and validation governed by `spx.config.{toml,json,yaml}`, with execution persistence for fast status reporting, and a typed `spx verification run` lifecycle agents and launchers drive to record, stream, validate, resume, and render verification runs through the journal substrate
- Result delivery — kind-agnostic, idempotent publication of a rendered verification, validation, or test result to the environment-bound backend (a local output target, a GitHub pull-request comment, a GitLab merge-request note, or an observability sink), so consumers deliver results without holding backend-specific I/O
- Harness environment management — deterministic management of `AGENTS.md`, Claude Code and Codex configuration, configured plugin marketplaces, plugins, and skills for agents
- Agent session coordination — discovery and native resume launch for Codex, Claude Code, and Pi agent sessions from the SPX CLI, distinct from SPX handoff session files
- Session management — work handoffs between agent contexts with priority ordering
- Release — per-release generation of release notes and documentation updates from the product git history, plus governed, provenance-bearing publication

### What's excluded

| Excluded                         | Rationale                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Hosted product-management system | SPX is the local deterministic harness; hosted planning or portfolio management belongs elsewhere.                         |
| General-purpose package manager  | SPX may drive package-manager scripts, but package resolution and dependency installation stay with package-manager tools. |
| General-purpose agent runtime    | SPX configures and invokes supported coding agents; it does not implement the agents themselves.                           |

## Product-level assertions

### Compliance

- ALWAYS: complete any CLI command in <100ms once the CLI process is running — agents depend on deterministic response times; this excludes Node.js process startup ([audit])
- ALWAYS: ingest spec-tree context deterministically from the tracked `spx/` tree, root decisions, ancestor specs, lower-index siblings, co-located evidence links, and node-local escape hatches ([audit])
- ALWAYS: govern spec-tree deterministic testing and validation through `spx.config.{toml,json,yaml}` rather than ad hoc files or command-local policy ([audit])
- ALWAYS: persist spec-tree execution results so status commands can report last-run results and staleness without re-running the configured execution ([audit])
- ALWAYS: provide a typed `spx verification run` lifecycle agents and launchers drive to record and stream verification runs, persisting each run's append-only event journal under `.spx/branch/{branch-slug}/` and validating the run type, scope, and finding payload before recording durable evidence ([audit])
- ALWAYS: deliver a rendered verification, validation, or test result to the environment-bound backend, upserting one backend target per marker and naming no result kind, so consumers publish results without holding backend-specific I/O ([audit])
- ALWAYS: manage methodology context source/version, harness environment configuration, `AGENTS.md`, Claude Code and Codex configuration, configured plugin marketplaces, plugins, and skills deterministically through typed product configuration ([audit])
- ALWAYS: resolve product root via `git rev-parse` with fallback to `$PWD` — consistent behavior across worktrees and subdirectories ([audit])
- NEVER: require network access for core operations — offline-first for development environments ([audit])
- NEVER: use LLM inference for operations that can be computed deterministically — tokens are for decisions, not file scanning ([audit])

## Open decisions

| Decision topic | Key question | Options | Triggers ADR/PDR? |
| -------------- | ------------ | ------- | ----------------- |
| None           | None         | None    | No                |
