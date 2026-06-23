# Worktree Command Surface and Controlling-Process Resolution

`spx worktree` exposes `claim`, `status`, and `release` as a Commander domain registered through the static descriptor registry. `claim` records the holding agent's controlling process — resolved by an explicit `SPX_WORKTREE_CONTROLLING_PID` override, else by walking spx's process ancestry to the nearest ancestor whose command names a known agent runtime (`claude` or `codex`), else the immediate parent — and writes nothing to stdout. `status` reports occupied, unclaimed, or stale for zero or more target worktrees through text output and a machine-parseable `--format json`, de-duplicating multiple path arguments that resolve to the same worktree root while preserving first-seen order. `release` removes the running worktree's claim quietly. Claim, release, and status resolve their target worktree's identity through the same git worktree-root resolution: `claim` and `release` from the running directory, and `status` from each path argument or, when omitted, the running directory. The process table, claim filesystem, git resolver, path-info probe, write-token source, host, and environment are injected.

## Rationale

Hook and skill flows can invoke `spx worktree claim` as a grandchild of an agent (agent → hook or skill → spx) and pass only `--session-id`, so spx must discover the controlling process itself. The agent runtime is the process whose liveness means "the worktree is held," and no universal agent-pid environment variable exists across runtimes, so the agent is identified among spx's ancestors by its command name. An explicit `SPX_WORKTREE_CONTROLLING_PID` override lets an atypical invocation chain — an extra wrapper or shell between the agent and the hook — pin the pid deterministically; the immediate-parent fallback keeps a claim from failing when no agent ancestor is recognized. The claim writes nothing to stdout so callers can run it inside hook flows without adding model-visible context.

Hook lifecycle input is handled by the hook interface governed by `spx/21-infrastructure.enabler/54-hooks.enabler/32-hook-interface-architecture.adr.md`; the worktree command surface remains an operator and skill command surface rather than a lifecycle event surface.

Process-table access, claim filesystem access, git resolution, path probing, write-token generation, the host, and the environment are injected so controlling-process resolution, command rendering, worktree identity resolution, and atomic claim writes verify over controlled inputs without a real process tree, real filesystem coupling in domain logic, or ambient process state. `status` and `release` reuse the occupancy store's injected liveness probe rather than re-deriving it.

A worktree's claim key is its worktree-root identity, not a raw path token. Resolving every command's target through the same git worktree-root resolution keeps the key independent of which path inside the worktree names it — the root, the running directory, or any path within — so the claim `claim` writes is the claim `status` reads. Keying `status` on the bare argument instead would let a path other than the exact root miss the claim, reading a held worktree free — the failure occupancy detection exists to prevent. Multi-target status treats shell-expanded pool listings as candidate worktree paths: every first-seen resolved worktree is reported under its derived claim name, duplicate path arguments that resolve to an already-reported worktree root are ignored, and a path that resolves to no worktree is never rendered as unclaimed. A single path that resolves to no worktree is refused rather than reported free, so a mistyped or non-worktree path is never mistaken for an unclaimed worktree.

JSON status output discriminates by request shape: a single-target invocation — zero or one path argument — emits one occupancy object with `worktree` and `status` keys, while a multi-target invocation — more than one path argument — emits an array of those objects, even when only one supplied path resolves. The request-shape discriminant preserves the legacy single-target contract and gives shell-expanded callers one stable collection shape.

## Invariants

- The set of `spx` command nouns equals the static descriptor registry's enumeration; the worktree domain joins by one descriptor and one registry entry.
- A successful `claim` produces no stdout bytes.
- claim, release, and status resolve their target worktree's identity through the same git worktree-root resolution, so a worktree's claim key is independent of which path inside it names it.

## Verification

### Audit

- ALWAYS: controlling-process resolution and every worktree command handler take each boundary it uses — process table, host provider, environment, claim filesystem, git resolver, path-info probe, or write-token source — as an injected parameter ([audit])
- ALWAYS: the worktree domain registers through the static descriptor registry via one explicit import, per [`spx/14-cli-composition.adr.md`](../../14-cli-composition.adr.md) ([audit])
- ALWAYS: status resolves each path argument — defaulting to the running directory when omitted — to a worktree root through the same git worktree-root resolution claim and release use, derives both the claim name and the `.spx/worktrees` scope from each resolved worktree rather than the caller's directory, reports each first-seen resolved worktree under its derived claim name, ignores duplicate path arguments that resolve to an already-reported worktree root, and never reports an unresolved path as unclaimed ([audit])
- NEVER: a worktree command handler reads the process table, host, environment, filesystem, git resolver, path info, or claim write token except through its injected dependencies ([audit])
- NEVER: the worktree command descriptor exposes an agent lifecycle hook event as a subcommand ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or `memfs` substitutes for the process table or filesystem — tests inject a controlled table and exercise the real resolution and rendering code paths ([audit])
