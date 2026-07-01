# spx

## Why this product exists

Outcome Engineering requires agents that follow the methodology — ingesting spec-tree context, respecting truth hierarchy, executing quality gates, journaling agentic verification runs, managing harness environment configuration, and preserving session continuity. spx is the deterministic harness that turns those methodology operations into configured local commands.

## Consumers and jobs

| Consumer / persona                | Job to be done                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Outcome Engineering practitioner  | Run methodology-governed product work through deterministic local commands                           |
| Coding agent                      | Receive spec-tree context, configured harness inputs, verification commands, and session continuity  |
| Product maintainer                | Inspect validation, test, review, audit, session, worktree, and release state without ad hoc scripts |
| CI and release automation         | Execute deterministic gates and publish provenance-bearing package releases                          |
| Verification launcher or reviewer | Record, stream, resume, render, and inspect typed verification runs                                  |

## Surfaces

- CLI — practitioners, agents, CI, release automation, and verification launchers run `spx` commands for context, validation, testing, verification, sessions, worktrees, and release support
- Tracked spec tree — practitioners, agents, and reviewers read `spx/` product truth, decisions, node specs, tests, and coordination notes
- Product configuration — product maintainers configure validation, testing, harness environment, and related command behavior through `spx.config.{toml,json,yaml}`
- Local state store — agents, session tooling, worktree tooling, test status, and verification runs use `.spx/` state scoped by shared repository state or local worktree state
- Result delivery backends — CI, reviewers, and automation consume rendered verification, validation, or test results through local output, GitHub pull-request comments, GitLab merge-request notes, or observability sinks

## Actors and sidedness

spx is a single-product harness with several cooperating actors around one product repository.

- Practitioner — provides product intent and reviews shipped behavior
- Coding agent — consumes instructions, context, configuration, and gates; produces code, tests, verification evidence, and session handoff state
- Product maintainer — configures repository-local policies and maintains release readiness
- CI and release automation — executes deterministic verification and package-publishing workflows
- Reviewer or verification consumer — receives rendered evidence and classifies findings

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
| Harness environment drift      | Manual config edits           | Configured and reproducible    | Count agent files reconciled from configured state                        |
| Session context loss           | Common (manual file handoffs) | Eliminated (CLI handoffs)      | Count context-loss incidents per week                                     |
| Methodology operation latency  | Minutes (LLM-based scanning)  | Milliseconds (deterministic)   | Benchmark CLI command execution time                                      |

## Scope

### What's included

- Code validation — configured source, formatting, test, dependency, documentation, and unused-code quality gates across product languages
- Deterministic context ingestion — spec-tree context loading from product root, ancestor specs, decisions, lower-index siblings, tests, and escape hatches without LLM inference
- Spec-tree execution — config-driven execution of deterministic testing and validation governed by `spx.config.{toml,json,yaml}`, with persisted state for fast status reporting, and a typed `spx verify` lifecycle agents and launchers drive to record, stream, validate, resume, and render verification runs through the journal substrate
- Result delivery — kind-agnostic, idempotent publication of a rendered verification, validation, or test result to the environment-bound backend (a local output target, a GitHub pull-request comment, a GitLab merge-request note, or an observability sink), so consumers deliver results without holding backend-specific I/O
- Harness environment management — deterministic management of `AGENTS.md`, Claude Code and Codex configuration, configured plugin marketplaces, plugins, and skills for agents
- Agent session coordination — discovery and resume launch for Codex and Claude Code agent sessions from the SPX CLI, distinct from SPX handoff session files
- Session management — work handoffs between agent contexts with priority ordering
- Release — per-release generation of release notes and documentation updates from the product git history, plus governed, provenance-bearing publication

### What's excluded

| Excluded                                                     | Rationale                                                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Replacing Codex, Claude Code, or other coding-agent runtimes | spx configures, launches, observes, and coordinates agents; the agent implementations remain external |
| Deploying consumer products                                  | spx governs and releases the harness itself; consumer-product deployment stays with each product      |
| Owning hosted review, CI, GitLab, GitHub, or observability   | spx renders and delivers results to environment-bound backends; the backend systems remain external   |
| Network-fetched setup during core offline operations         | Core commands run from local product state and configured local capabilities                          |

## Product-level assertions

### Compliance

- ALWAYS: complete any CLI command in <100ms once the CLI process is running — agents depend on deterministic response times; this excludes Node.js process startup ([audit])
- ALWAYS: ingest spec-tree context deterministically from the tracked `spx/` tree, root decisions, ancestor specs, lower-index siblings, co-located evidence links, and node-local escape hatches ([audit])
- ALWAYS: govern spec-tree deterministic testing and validation through `spx.config.{toml,json,yaml}` rather than ad hoc files or command-local policy ([audit])
- ALWAYS: persist spec-tree execution state so status commands can report last-run results and staleness without re-running the configured execution ([audit])
- ALWAYS: provide a typed `spx verify` lifecycle agents and launchers drive to record and stream verification runs, persisting each run's append-only event journal under `.spx/branch/{branch-slug}/` and validating the run type, scope, and finding payload before recording durable evidence ([audit])
- ALWAYS: deliver a rendered verification, validation, or test result to the environment-bound backend, upserting one backend target per marker and naming no result kind, so consumers publish results without holding backend-specific I/O ([audit])
- ALWAYS: manage harness environment configuration deterministically, including `AGENTS.md`, Claude Code and Codex configuration, configured plugin marketplaces, plugins, and skills for agents ([audit])
- ALWAYS: resolve product root via `git rev-parse` with fallback to `$PWD` — consistent behavior across worktrees and subdirectories ([audit])
- NEVER: require network access for core operations — offline-first for development environments ([audit])
- NEVER: use LLM inference for operations that can be computed deterministically — tokens are for decisions, not file scanning ([audit])

## Open decisions

| Decision topic                        | Key question                                                 | Options                              | Triggers ADR/PDR? |
| ------------------------------------- | ------------------------------------------------------------ | ------------------------------------ | ----------------- |
| CI test-output environment            | What machine-readable output contract should `spx test` use? | JSONL / step summary / both          | yes               |
| Additional agent adapters             | Which agent runtimes join the configured harness?            | Codex and Claude Code / more agents  | yes               |
| Hosted verification backend expansion | Which result-delivery backends should receive first support? | GitHub / GitLab / observability sink | yes               |
| Consumer-product release integration  | How far should spx release support extend beyond itself?     | harness-only / consumer integration  | yes               |
