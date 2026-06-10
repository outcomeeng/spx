# Open Issues

## `isPathContained` lacks standalone edge-case coverage

`src/lib/file-system/pathContainment.ts` exports `isPathContained(root, candidate)`, a shared path-containment predicate now consumed by `src/domains/release/release-notes.ts` (changelog-path resolution) and `src/domains/audit/paths.ts` (audit-verdict path validation). It is exercised only transitively — through one `../../etc/passwd` case in the audit paths tests and the release-notes compliance tests — so its documented edges have no explicit home: the exact `..` segment boundary, the `..foo` non-escape case, an empty-string candidate (which resolves to `root` itself), and cross-drive paths on Windows.

Resolution: when this node is implemented, give `isPathContained` a standalone property/scenario test covering those edges, so a third consumer inherits verified behavior. Until then the two call sites' tests are the only coverage.
