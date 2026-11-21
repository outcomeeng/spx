# spx

spx turns Outcome Engineering methodology operations into deterministic, configured local commands for practitioners, coding agents, and CI and release automation: ingesting Product Tree context, executing quality gates, journaling agentic verification runs, managing harness environment configuration, and preserving session continuity.

## Product boundaries

### What's included

- Code validation — configured source, formatting, test, dependency, documentation, and unused-code quality gates across product languages
- Deterministic context ingestion — the context of a Product Tree target derived from its position alone, without LLM inference
- Spec-tree execution — config-driven execution of deterministic testing and validation governed by `spx.config.{toml,json,yaml}`, with execution persistence for fast status reporting, and a typed `spx verification run` lifecycle agents and launchers drive to record, stream, validate, resume, and render verification runs through the journal substrate
- Result delivery — kind-agnostic, idempotent publication of a rendered verification, validation, or test result to the environment-bound backend (a local output target, a GitHub pull-request comment, a GitLab merge-request note, or an observability sink), so consumers deliver results without holding backend-specific I/O
- Harness environment management — deterministic management of `AGENTS.md`, each supported coding agent's configuration, configured plugin marketplaces, plugins, and skills for agents
- Agent session coordination — native resume discovery, launch, and transcript-content search for the sessions of each supported coding agent from the SPX CLI, distinct from SPX handoff session files
- Session management — work handoffs between agent contexts with priority ordering
- Release — per-release generation of release notes and documentation updates from the product git history, plus governed, provenance-bearing publication

### What's excluded

- A hosted product-management system — SPX runs locally; hosted planning or portfolio management belongs elsewhere.
- A general-purpose package manager — SPX may drive package-manager scripts, but package resolution and dependency installation stay with package-manager tools.
- A general-purpose agent runtime — SPX configures and invokes supported coding agents; it does not implement the agents themselves.

### What it exposes

- The CLI — practitioners, coding agents, CI, and release automation invoke deterministic methodology operations.
- MCP, web API, and UI — integration-facing and user-facing interaction boundaries expose SPX capabilities through protocol or visual contracts.
- Local output targets — terminal output and local files deliver deterministic command results to practitioners, agents, and automation.
- GitHub pull-request comments, checks, and release workflow outputs, and GitLab merge-request notes and observability sinks — deliver verification, review, validation, and package-publication results.

### What it consumes

- Coding-agent adapters — launch and resume each supported coding agent, with observation and communication capabilities supplied by each adapter's declared contract.
- Agent harness inputs — methodology context source and version, agent configuration, instruction files, plugin marketplaces, plugins, skills, invocation policy, and isolated execution state, through typed product configuration.
- The repository host — git history, pull requests, workflow artifacts, and release records.
