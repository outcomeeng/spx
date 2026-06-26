# File Inclusion

PROVIDES consistent file-scope decisions for spx commands that walk files or pass file arguments to downstream tools
SO THAT every validation, testing, and internal traversal command deciding which product paths participate
CAN include explicit caller paths, default automatic walks to git-visible product files, apply command-specific scope filters, honor ignore override flags, and explain included or excluded paths consistently

## Assertions

### Scenarios

- Given a caller supplies explicit paths, when file scope is resolved, then every supplied path is reported as included regardless of git's view or any command-specific filter, and the explanation marks the path as explicitly requested ([test](tests/file-inclusion.scenario.l1.test.ts))
- Given a caller requests an automatic walk without explicit paths, when file scope is resolved, then walked entries git considers ignored under the working tree — through `.gitignore`, nested `.gitignore`, `.git/info/exclude`, or global gitignore — are excluded, entries inside a submodule do not participate, walked paths outside a configured include filter are excluded, walked paths matching a configured exclude filter are excluded, and every emitted excluded path reports the responsible reason ([test](tests/file-inclusion.scenario.l1.test.ts))
- Given a caller passes `--no-ignore` to a command that walks files, when file scope is resolved, then entries that any git ignore source would otherwise exclude are included and the explanation records the caller override ([test](tests/file-inclusion.scenario.l1.test.ts))
- Given a resolved scope is supplied to a downstream tool command, when the tool invocation is produced, then the invocation excludes exactly the resolved excluded set using the tool's native ignore syntax and references no other paths ([test](tests/file-inclusion.scenario.l1.test.ts))

### Compliance

- ALWAYS: every spx command that invokes a downstream tool with file-scope arguments forwards a path set consistent with this node's inclusion decision; no command produces a conflicting included or excluded set for the same request ([audit])
- ALWAYS: product path vocabulary used by file-scope decisions is configurable through product configuration rather than source edits ([audit])
- ALWAYS: the default automatic scope comes from git's view of the current worktree per `11-ignore-defaults.pdr.md`; no parallel artifact-directory list, hidden-prefix rule, or standalone ignore-source file decides default scope ([audit])
- NEVER: a command owns a separate default exclusion set or a separate downstream-tool ignore vocabulary that can disagree with this node's file-scope decision ([audit])
- NEVER: an explicit caller-supplied path be dropped, rewritten, or ignored by any filter layer — explicit paths express caller intent and bypass every other layer ([test](tests/file-inclusion.scenario.l1.test.ts))
