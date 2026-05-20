# Ignore Source

PROVIDES the git-tracking reader — invokes `git ls-files --cached --others --exclude-standard --full-name` at construction against the worktree resolved per `spx/15-worktree-resolution.pdr.md` and exposes membership queries over the resulting typed set of included paths, plus override-aware construction that translates `--no-ignore`, `--no-ignore-vcs`, and `--ignore-file` into the equivalent git plumbing arguments
SO THAT the path-predicates child (`../32-path-predicates.enabler/`) evaluating the git-tracking layer and the scope-resolver child (`../43-scope-resolver.enabler/`) assembling decision trails
CAN consult the operator's effective scope through one typed surface without re-shelling out to git per path or re-implementing git's ignore-resolution logic

## Assertions

### Scenarios

- Given the reader is constructed against a worktree where `git ls-files --cached --others --exclude-standard --full-name` enumerates a path, when the reader is queried with that path, then the reader reports the path as tracked-or-untracked-not-ignored ([test](tests/ignore-source.scenario.l1.test.ts))
- Given the reader is constructed against a worktree where a path matches `.gitignore`, when the reader is queried with that path, then the reader reports the path as not in the included set ([test](tests/ignore-source.scenario.l1.test.ts))
- Given the reader is constructed against a worktree where a path matches `.git/info/exclude` or the user's global gitignore, when the reader is queried with that path, then the reader reports the path as not in the included set ([test](tests/ignore-source.scenario.l1.test.ts))
- Given the reader is constructed with override flag `--no-ignore`, when the reader is queried with a path that any git ignore source would otherwise exclude, then the reader reports the path as in the included set ([test](tests/ignore-source.scenario.l1.test.ts))
- Given the reader is constructed with override flag `--no-ignore-vcs`, when the reader is queried with a path matched by `.gitignore` only, then the reader reports the path as in the included set; when the reader is queried with a path matched by `.git/info/exclude` or global gitignore, then the reader reports the path as not in the included set ([test](tests/ignore-source.scenario.l1.test.ts))
- Given the reader is constructed with override flag `--ignore-file <path>`, when the reader is queried with a path matching a pattern in the supplied file, then the reader reports the path as not in the included set ([test](tests/ignore-source.scenario.l1.test.ts))
- Given the reader is constructed against a directory that is not inside a git working tree, when construction runs, then construction fails with an actionable error naming the directory and the missing git context ([test](tests/ignore-source.scenario.l1.test.ts))

### Properties

- The reader is deterministic: the same worktree state and the same override flags always produce the same included set and the same membership-query results ([test](tests/ignore-source.property.l1.test.ts))
- Membership queries are O(1) lookups against an in-memory set: the reader performs no filesystem or subprocess I/O after construction ([test](tests/ignore-source.property.l1.test.ts))

### Mappings

- Override flag to git plumbing translation: `--no-ignore` translates to omitting `--exclude-standard`; `--ignore-file <path>` translates to adding `--exclude-from <path>` to the standard argument set; `--no-ignore-vcs` translates to the git plumbing argument shape required to honor `.git/info/exclude` and global gitignore while bypassing top-level and nested `.gitignore` files — the specific argument shape is governed by `21-reader-shape.adr.md` ([test](tests/ignore-source.mapping.l1.test.ts))

### Compliance

- ALWAYS: the reader's git invocations all happen at construction — query methods are pure over the constructed set and perform no filesystem or subprocess I/O ([review])
- ALWAYS: the reader resolves its worktree root per `spx/15-worktree-resolution.pdr.md` and passes it as the `-C` argument or `cwd` of every git invocation ([review])
- ALWAYS: override-flag translation happens once at construction; the constructed reader records which overrides were applied so consumers can inspect them through the decision trail ([review])
- NEVER: shell out to git from any module outside this enabler — git plumbing is invoked only here ([review])
- NEVER: parse `.gitignore`, `.git/info/exclude`, or `core.excludesFile` content directly — spx delegates the ignore-resolution semantics to git plumbing ([review])
- NEVER: emit tool-specific flag syntax from this enabler — tool-flag production lives in `../54-tool-adapters.enabler/` ([review])
- NEVER: write to any file in the worktree or the git repository — the reader is read-only ([review])
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — tests construct real git worktrees under temp directories via `../../22-test-environment.enabler/` ([review])
