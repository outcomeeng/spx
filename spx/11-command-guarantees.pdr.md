# Command Guarantees

GOVERNS the guarantees every SPX command and operation keeps
SO THAT a practitioner, a coding agent or CI automation running SPX
CAN RELY ON fast, offline, deterministic local operations governed by committed product configuration

### Audit: command guarantees

- command-latency: ALWAYS: a CLI command that reads repository state completes in under 100 ms once the CLI process is running; Node.js process startup is excluded, and a command that scans an agent-native transcript store is bounded by the native locator's time over that store rather than by this limit.
- deterministic-context: ALWAYS: the context of a Product Tree target is a pure function of the tracked `spx/` tree, in this order: every ancestor spec from the product root down; at each level of the path, every sibling spec and each decision indexed below the child the path continues through; every `ISSUES.md` on the path; each decision the path cites from another subtree, once; the target's immediate children and its own decisions; and its own spec with its outcome record and its `knowledge/index.md`; `tests/`, `evals/`, `probes/` and `audits/` stay out.
- config-governed-execution: ALWAYS: Product Tree deterministic testing and validation are governed through `spx.config.{toml,json,yaml}`, never through ad hoc files or command-local policy.
- persisted-results: ALWAYS: Product Tree execution results persist, so status commands report last-run results and staleness without re-running the configured execution.
- verification-run-lifecycle: ALWAYS: a typed `spx verification run` lifecycle lets agents and launchers record and stream verification runs, persisting each run's append-only event journal under `.spx/branch/{branch-slug}/` and validating the run type, scope, and finding payload before recording durable evidence.
- result-delivery: ALWAYS: a rendered verification, validation, or test result is delivered to the environment-bound backend, upserting one backend target per marker and naming no result kind, so consumers publish results without holding backend-specific I/O.
- harness-configuration: ALWAYS: methodology context source and version, harness environment configuration, `AGENTS.md`, each supported coding agent's configuration, configured plugin marketplaces, plugins, and skills are managed deterministically through typed product configuration.
- product-root-resolution: ALWAYS: a command that resolves a product root resolves it via `git rev-parse` from its effective invocation directory, which `-C <path>` sets, and falls back to that directory outside a repository, consistently across worktrees and subdirectories.
- offline-core: NEVER: a core operation requires network access.
- no-llm-inference: NEVER: an operation that can be computed deterministically uses LLM inference.
