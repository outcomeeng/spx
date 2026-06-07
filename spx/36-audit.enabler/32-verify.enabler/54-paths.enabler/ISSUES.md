# Known Issues: 54-paths.enabler

Tracked, not blocking.

## Path-containment implementation over-rejects names beginning with `..`

`21-paths.adr.md` declares the correct escape predicate as an Invariant: a resolved path escapes when `path.relative(productDir, resolvedPath)` is `..`, begins with `..` followed by the path separator, or is absolute — a name that merely begins with `..` (such as `..fixtures/spec.md`) stays in scope.

The implementation at `src/domains/audit/paths.ts` is the lower layer and currently lags this declaration: it detects an escaping path with `rel.startsWith("..")`, so an in-tree finding whose first segment merely begins with `..` is wrongly flagged as escaping. Per the truth hierarchy (ADR → code), the code is in violation until reconciled.

Resolution (a code change, out of scope for the decision-record migration that surfaced this): narrow the guard to `rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)`, and add a test asserting a `..fixtures`-style in-tree path is not flagged as escaping.
