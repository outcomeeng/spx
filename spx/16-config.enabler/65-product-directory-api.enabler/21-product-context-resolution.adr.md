# Product Context Resolution

CLI invocation resolves one immutable product context from the process directory and the optional global `-C <path>` option, and config owns the typed API that carries that context into command handlers and domain modules. Config loading, descriptor validation, root selection, and state addressing read product directories from that context rather than from ambient process state.

## Rationale

One product context keeps root-affecting behavior independent of the command interface that triggered it. Implementing `-C` by changing the process directory or by adding command-local path branches would make config, state, session, validation, and monorepo behavior diverge under the same invocation.

## Invariants

- The same process directory and `-C` argument produce the same product context for every command domain.
- A command's root resolution is a pure function of the product context, the state class it touches, and injected git/filesystem probes.

## Verification

### Testing

- ALWAYS: the CLI parser maps `spx -C <path> <command>` to a product context whose effective invocation directory is `<path>` and whose resolved product roots match invoking the same command from `<path>` without `-C` ([mapping])
- ALWAYS: when `-C` is absent, the product context resolves from the process directory and preserves the non-git fallback diagnostic behavior defined by `spx/15-worktree-management.pdr.md` ([mapping])
- ALWAYS: a command invoked from a dirty unrelated worktree with `-C <target>` resolves config, root directories, and state paths from `<target>` rather than from the caller's worktree ([compliance])

### Audit

- ALWAYS: config-owned product-context APIs carry root-directory inputs into commands and domains as typed values; command handlers and domain modules do not re-read `process.cwd()` to decide product roots ([audit])
- ALWAYS: root-resolution helper names distinguish effective invocation directory, tracked `productDir`, worktree-local product root, and Git common-dir product root vocabulary ([audit])
- ALWAYS: product-context resolution uses injected git and filesystem dependencies so command behavior is observable through supplied dependency implementations ([audit])
- NEVER: implement `-C` with `process.chdir()` — the process directory is not mutated to carry product context ([audit])
- NEVER: add domain-local `-C` parsing or command-specific root overrides; the global product context is the only CLI path override ([audit])
