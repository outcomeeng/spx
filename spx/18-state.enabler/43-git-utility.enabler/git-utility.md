# Git Utility

PROVIDES shared git path primitives over an injected git runner — committed-range net-diff, worktree comparison, staged, dirty-worktree, and untracked product-path discovery plus NUL-delimited name-status parsing
SO THAT infrastructure, precommit, file-inclusion, testing, verification, session, diagnose, and worktree consumers
CAN resolve net changed product paths without duplicating git command construction, parsing, root handling, or command-local git plumbing

## Assertions

### Conformance

- A committed range maps `base` and `head` to the product paths emitted by `git diff --name-status -z base..head` ([test](tests/git-utility.conformance.l1.test.ts))
- A worktree comparison maps `base` to the union of product paths emitted by `git diff --name-status -z base` and untracked product paths emitted by `git ls-files --others --exclude-standard -z` ([test](tests/git-utility.conformance.l1.test.ts))
- A staged comparison maps `base` to the product paths emitted by the staged name-status diff against `base` ([test](tests/git-utility.conformance.l1.test.ts))
- A dirty worktree maps to the union of tracked changed product paths and untracked product paths emitted by `git ls-files --others --exclude-standard -z` ([test](tests/git-utility.conformance.l1.test.ts))
- Untracked path discovery maps to product paths emitted by `git ls-files --others --exclude-standard -z` ([test](tests/git-utility.conformance.l1.test.ts))

### Properties

- NUL-delimited name-status parsing preserves product path bytes as path text, including whitespace ([test](tests/git-utility.property.l1.test.ts))
- Rename and copy name-status records include every product path the record names ([test](tests/git-utility.property.l1.test.ts))

### Compliance

- NEVER: testing, verification, infrastructure, session, diagnose, or worktree command handlers parse changed-path git output directly when this provider covers the requested path set ([audit])
