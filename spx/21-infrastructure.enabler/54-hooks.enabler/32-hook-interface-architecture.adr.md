# Hook Interface Architecture

CONSTRAINS the boundary through which SPX handles agent lifecycle hooks
TO a peer hook interface layer under `src/interfaces/hooks/`, with an explicit event registry keyed by lifecycle event name into which the `spx hook run <event>` CLI transport dispatches, and hook adapters that own the hook process contract and call shared domain services below both interface layers
SO THAT host lifecycle semantics stay apart from operator commands while sharing domain logic with them, and a hook's session identity binds to the invocation instead of to a guess

### Audit: hook layering

- adapters-registered: ALWAYS: hook event adapters live under `src/interfaces/hooks/` and register through an explicit hook event registry.
- registry-complete: ALWAYS: the hook event registry is the complete set of lowercase hyphenated event operands `spx hook run <event>` accepts.
- transport-delegates: ALWAYS: the `spx hook run <event>` CLI transport delegates to the hook event registry without embedding event behavior in the CLI command descriptor.
- shared-occupancy: ALWAYS: shared operations used by both `spx worktree claim` and `spx hook run session-start` live below the command and hook interface layers, so both surfaces call the same worktree occupancy logic and neither depends on the other.
- no-command-imports: NEVER: a module under `src/interfaces/hooks/` imports from `src/commands/`, or a command handler imports a hook handler.
- no-lifecycle-subcommands: NEVER: a domain-specific command descriptor exposes an agent lifecycle event as a subcommand.
- lifecycle-organization: NEVER: hook event behavior is organized by the implementation package that first consumes it; it is organized by lifecycle event and delegates to consuming domains.
- adapters-own-io: ALWAYS: hook adapters are the only modules that interpret hook payload stdin, the hook runtime environment, hook env-file paths and hook-specific stdout, and they own stderr diagnostics, env-file writes and nonblocking degraded completion.
- injected-boundaries: ALWAYS: hook adapters isolate hook runtime reads, bounded transcript reads, output writes and env-file writes behind typed boundary functions or injected dependencies, so event logic verifies without replacing modules through a mocking framework.
- no-module-mocks: NEVER: hook tests use `vi.mock()` or `jest.mock()` to replace hook event modules, command handlers or shared domain services; they exercise real registry dispatch or typed injected boundary objects.

### Audit: session-start identity

- payload-id-precedence: ALWAYS: `session-start` gives a non-empty explicit payload session id precedence over every inferred identity.
- transcript-path-identity: ALWAYS: when the payload omits a session id and supplies an exact native transcript path, the adapter derives session identity only from a valid session header of the delivering agent at that exact path, after canonical containment under that agent's configured session-store root, with a cwd that matches the hook's resolved product directory; the delivering agent is the coding agent the hook payload names or, when the payload names none, the agent that agent identification under [spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md](spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md) yields.
- bounded-transcript-read: ALWAYS: transcript metadata reads are bounded independently of transcript size and use a typed injected reader, and canonical path resolution for the configured session-store root and the supplied transcript path enters through the same boundary.
- canonical-containment: ALWAYS: a supplied transcript path is canonicalized and proven contained by the delivering agent's canonical configured session-store root before its opening metadata is read.
- no-lexical-containment: NEVER: lexical containment substitutes for canonical containment when a transcript path can traverse a symlink.
- no-store-scan: NEVER: `session-start` scans a session store, selects a latest transcript, reads a transcript outside the trusted session-store root, or records a worktree claim from untrusted, malformed, missing or product-mismatched transcript metadata.

### Audit: session-start effects

- occupancy-setup: ALWAYS: the `session-start` hook adapter owns worktree occupancy setup for the agent session, and the `PreToolUse` hook adapter performs no status-then-claim occupancy repair loop.
- env-file-exports: ALWAYS: whenever the hook runtime supplies an env-file path, the `session-start` hook adapter writes a `PROJECT_DIR` export and the session and project exports the delivering agent's module declares under [spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md](spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md), each when enough identity and project information exists to compute its value; it writes an absolute `SPX_WORKTREE_CLAIM_PATH` export when the worktree claim succeeds, and `unset SPX_WORKTREE_CLAIM_PATH` when the worktree claim is unavailable.
