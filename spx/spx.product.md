# spx

## Why this product exists

Outcome Engineering requires agents that follow the methodology — navigating spec trees, respecting truth hierarchy, enforcing quality gates, managing session handoffs. Without tooling, agents drift from specs, skip validation, and lose context across sessions. spx is the agent harness that keeps them on the rails.

## Product hypothesis

WE BELIEVE THAT providing an agent harness for Outcome Engineering (validation, session management, spec tree operations)
WILL cause practitioners to trust AI agents to follow the methodology, keeping agents on the rails instead of drifting from specs
CONTRIBUTING TO higher engineering velocity — teams ship quality code faster because the methodology overhead drops from minutes to milliseconds

### Evidence of success

| Metric                  | Current                       | Target                       | Measurement approach                      |
| ----------------------- | ----------------------------- | ---------------------------- | ----------------------------------------- |
| Agent methodology drift | Frequent (no guardrails)      | Rare (harness enforces)      | Count spec violations per agent session   |
| Quality gate coverage   | Manual (developer remembers)  | Automatic (spx validates)    | % of commits passing `spx validation all` |
| Session context loss    | Common (manual file handoffs) | Eliminated (CLI handoffs)    | Count context-loss incidents per week     |
| Methodology overhead    | Minutes (LLM-based scanning)  | Milliseconds (deterministic) | Benchmark CLI command execution time      |

## Scope

### What's included

- Code validation — ESLint, TypeScript type checking, circular dependency detection, unused code analysis
- Session management — work handoffs between agent contexts with priority ordering

### What's excluded

| Excluded                      | Rationale                                  |
| ----------------------------- | ------------------------------------------ |
| GUI / web interface           | spx is a CLI tool; integrations can add UI |
| Interactive prompts / wizards | CLI-first for agent compatibility          |
| Third-party plugin API        | Requires stable domain interfaces first    |

## Product-level assertions

### Compliance

- ALWAYS: complete any CLI command in <100ms once the CLI process is running — agents depend on deterministic response times; this excludes Node.js process startup ([review])
- ALWAYS: resolve product root via `git rev-parse` with fallback to `$PWD` — consistent behavior across worktrees and subdirectories ([review])
- NEVER: require network access for core operations — offline-first for development environments ([review])
- NEVER: use LLM inference for operations that can be computed deterministically — tokens are for decisions, not file scanning ([review])
