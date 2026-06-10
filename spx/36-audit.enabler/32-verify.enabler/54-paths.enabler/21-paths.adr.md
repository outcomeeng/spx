# Path Validation Module

Path validation is a pure function, `validatePaths(verdict, productDir, fileExists)`, that returns a `readonly string[]` of defect messages — empty when every referenced file resolves — each suitable for display as `paths: {message}`. For each finding's `spec_file` and `test_file` it checks that the resolved path stays within `productDir` and asks the injected `fileExists(absolutePath)` reader whether the file exists, never reading file contents and never throwing.

## Rationale

`productDir` is supplied as a parameter rather than read from `process.cwd()` so the boundary is explicit and tests can pass a temp directory without patching global state; the verify pipeline already knows the product directory from its own context. `fileExists` is supplied as a parameter so the domain module contains no filesystem access while keeping path validation synchronous and consistent with the structural and semantic validators. Containment is checked before existence so the function never asks the injected reader about a path outside the product directory: a path that escapes gets a "path escapes product directory" defect and skips the existence check.

## Invariants

- An empty `readonly string[]` return means no path defects.
- A resolved path escapes `productDir` when `path.relative(productDir, resolvedPath)` is `..`, begins with `..` followed by the path separator, or is absolute; a name that merely begins with `..` (such as `..fixtures`) stays in scope.
- For a given `fileExists` response set, the same verdict and the same `productDir` always produce the same output.
- Each defect string names the specific path that failed.

## Verification

### Audit

- ALWAYS: resolve all paths relative to `productDir` ([audit])
- ALWAYS: accept file-existence behavior as an injected `fileExists(absolutePath)` function ([audit])
- ALWAYS: report "path escapes product directory" when a path resolves outside `productDir` ([audit])
- ALWAYS: report "missing file" naming the path when a path does not exist ([audit])
- ALWAYS: check both the `spec_file` and `test_file` fields in every finding ([audit])
- NEVER: import `node:fs`, `node:fs/promises`, process globals, or `src/commands/audit/` from `src/domains/audit/paths.ts` ([audit])
- NEVER: read, parse, or validate the content of referenced files — only check existence and containment ([audit])
- NEVER: check element presence or enum membership — those are structural concerns ([audit])
- NEVER: throw exceptions — defects are reported as strings in the return value ([audit])
