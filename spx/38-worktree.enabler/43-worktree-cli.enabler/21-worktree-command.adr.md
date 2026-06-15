# Worktree Command Surface and Controlling-Process Resolution

`spx worktree` exposes `claim`, `status`, and `release` as a Commander domain registered through the static descriptor registry. `claim` records the holding agent's controlling process — resolved by an explicit `SPX_WORKTREE_CONTROLLING_PID` override, else by walking spx's process ancestry to the nearest ancestor whose command names a known agent runtime (`claude` or `codex`), else the immediate parent — and writes nothing to stdout. `status` reports occupied, unclaimed, or stale through a machine-parseable `--format json`. `release` removes the running worktree's claim quietly. The process table, the host, and the environment are injected.

## Rationale

The SessionStart hook invokes `spx worktree claim` as a grandchild of the agent (agent → hook → spx) and passes only `--session-id`, so spx must discover the controlling process itself. The agent runtime is the process whose liveness means "the worktree is held," and no universal agent-pid environment variable exists across runtimes, so the agent is identified among spx's ancestors by its command name. An explicit `SPX_WORKTREE_CONTROLLING_PID` override lets an atypical invocation chain — an extra wrapper or shell between the agent and the hook — pin the pid deterministically; the immediate-parent fallback keeps a claim from failing when no agent ancestor is recognized. The claim writes nothing to stdout because the hook injects a command's stdout into the agent's context.

Process-table access, the host, and the environment are injected so controlling-process resolution and command rendering verify over controlled inputs without a real process tree, and `status`/`release` reuse the occupancy store's injected liveness probe rather than re-deriving it.

## Invariants

- The set of `spx` command nouns equals the static descriptor registry's enumeration; the worktree domain joins by one descriptor and one registry entry.
- A successful `claim` produces no stdout bytes.

## Verification

### Audit

- ALWAYS: controlling-process resolution and every worktree command handler take the process table, the host provider, and the environment as injected parameters ([audit])
- ALWAYS: the worktree domain registers through the static descriptor registry via one explicit import, per [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md) ([audit])
- NEVER: a worktree command handler reads the process table, the host, or the environment except through its injected dependencies ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or `memfs` substitutes for the process table or filesystem — tests inject a controlled table and exercise the real resolution and rendering code paths ([audit])
