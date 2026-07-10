# State Resolution and Storage

spx resolves where a command runs and where its local execution state lives through one module built from pure functions and thin probes over an injected git runner and filesystem interface. Product-root resolution returns a base `GitProductDirResult` and a Git-common-dir variant that adds a required `worktreeRoot` field; `.spx/` scope addressing, branch identity and slugging, and JSONL run-record mechanics compose on those roots. Every consumer obtains roots, scopes, and records by passing its own domain noun and payload schema, never re-deriving git topology or `.spx/` layout. The two roots are those of `spx/15-worktree-management.pdr.md`: the local worktree root from `git rev-parse --show-toplevel`, and the Git common-dir product root from the parent of `git rev-parse --git-common-dir`.

## Rationale

Resolution and storage mechanics are shared across release, spec-domain, change, session, compact, testing, and verification. Concentrating them behind injected dependencies keeps every consumer free of git plumbing and `.spx/` layout, and lets root resolution, scope composition, and record I/O verify over controlled roots and a controlled filesystem without a real repository. The result-shape split — a base product-directory result and a Git-common-dir subtype carrying the worktree root — lets a caller that needs both roots read `--show-toplevel` once rather than pairing two resolvers. Branch identity is source-owned in the module so every consumer shares one slug contract.

A consumer re-deriving git topology or hand-composing `.spx/` paths is rejected: it drifts from the shared layout and reopens the per-consumer git boundary the injection closes. Module-level interception of git or filesystem calls is rejected: it hides the boundary the injected dependencies make explicit and verifies against a fiction rather than real helper code paths.

An async scope resolver returns a result struct carrying the product-root `warning` only when its consumer surfaces the not-in-git diagnostic; a resolver whose sole consumer is presentation-free returns the bare scope path, so no `warning` is threaded for a consumer to discard. The shape follows the consumer, not a uniform family signature.

## Invariants

- Product-root resolution, scope composition, branch slugging, and run-path construction are deterministic for the same roots, tokens, and domain noun.
- Composing a `.spx/` scope directory from an already-resolved product root is total: it returns a bare path and never a `Result`. A `Result` return is reserved for composition that validates an untrusted scope token or branch slug.
- Branch slugging is a pure function of the canonical branch identity.
- A single-artifact run path is always a file path, never a directory path.
- Every `detectGitCommonDirProductRoot` result sets `worktreeRoot` to a string on every return path; a `detectWorktreeProductRoot` result never carries `worktreeRoot`.

## Verification

### Testing

- ALWAYS: each `detectGitCommonDirProductRoot` resolution outcome maps to a result whose `worktreeRoot` is the `git rev-parse --show-toplevel` value on the git paths and `cwd` outside a git repository ([mapping])
- ALWAYS: a Git-common-dir result's `productDir` maps to the parent of `git rev-parse --git-common-dir` per `spx/15-worktree-management.pdr.md`, falling back to the `--show-toplevel` value when the common-dir read fails ([mapping])
- NEVER: a `detectWorktreeProductRoot` result carries `worktreeRoot` — the base `GitProductDirResult` shape omits it and its `productDir` is the worktree root ([mapping])
- ALWAYS: scope composition is deterministic for the same product roots, tokens, and domain noun ([property])
- ALWAYS: branch slugging preserves path safety, byte bounds, and deterministic digest suffixes across branch identities ([property])
- ALWAYS: a single-artifact run path is `runs/run-{run-token}.jsonl`, never a directory of sibling artifacts ([property])
- ALWAYS: JSONL helpers append records and read back the latest parse-valid line, ignoring blank trailing lines ([compliance])

### Audit

- ALWAYS: product-root resolution returns a base `GitProductDirResult`, and the Git-common-dir resolver returns a subtype adding the required `worktreeRoot` field, so a caller needing both roots reads `--show-toplevel` once ([audit])
- ALWAYS: root resolution, scope addressing, and record mechanics are pure functions or thin probes over an injected git runner and an injected filesystem interface — git reads and file I/O happen only through the injected dependencies ([audit])
- ALWAYS: consumers obtain roots, scopes, and records by passing their own domain noun and payload schema; payload validation stays in the consumer domain ([audit])
- ALWAYS: branch identity and slugging are source-owned in the state module so every consumer shares one slug contract ([audit])
- ALWAYS: the state module exports source-owned constants for the `.spx/` path tokens and run-file tokens its tests reference ([audit])
- NEVER: a consumer re-derives git topology or composes `.spx/` paths itself — root resolution and scope layout live only in the state module ([audit])
- NEVER: a scope-directory resolver that only joins an already-resolved product root wraps its return in `Result` — the `Result` shape is reserved for composition that validates an untrusted token or slug ([audit])
- NEVER: thread the not-in-git `warning` through a scope resolver whose only consumer is presentation-free — the worktree-scope resolver returns a bare path for compact, which emits JSON or nothing, while resolvers feeding user-facing consumers return a struct carrying `warning` ([audit])
- NEVER: the state module imports a consumer domain (release, spec, change, session, compact, testing, verification) ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or `memfs` substitutes for the git or filesystem boundary — tests pass controlled git and filesystem implementations through the public injection API and exercise the real helper code paths ([audit])
- NEVER: a consumer domain duplicates branch slugging ([audit])
