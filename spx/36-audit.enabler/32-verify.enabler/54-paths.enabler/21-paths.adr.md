# Path Validation Module

## Purpose

This decision governs the TypeScript module for path validation of a structurally and semantically valid `AuditVerdict` — checking that every `spec_file` and `test_file` path referenced in assertion findings resolves to an existing file within the project root and does not escape it.

## Context

**Business impact:** The paths stage is the fourth and final stage in the four-stage verify pipeline. It assumes structural and semantic validity: enum values are valid, required elements are present, and the verdict is internally coherent. A path defect means the verdict references files that do not exist in the working tree, making the verdict's traceability claims unverifiable.

**Technical constraints:** The paths stage receives a fully parsed `AuditVerdict` from the reader, validated by the structural and semantic stages. It requires access to the filesystem to check file existence. The project root is supplied as a string parameter — the caller determines it from the working directory or CLI argument. The stage produces a list of defect strings; it does not throw.

## Decision

The path validation module exports a single `validatePaths(verdict: AuditVerdict, projectRoot: string): readonly string[]` function. An empty array means no defects. Each element of the returned array is a defect message string suitable for display as `paths: {message}` in the verify pipeline output.

For each finding across all gates, two checks run per path-bearing field (`spec_file`, `test_file`):

1. Path containment: the resolved path must not escape the project root; if it does, a "path escapes project root" defect is reported
2. File existence: the resolved path must refer to an existing file; if it does not, a "missing file" defect naming the path is reported

The function uses `path.relative` to detect escaping and `existsSync` for existence checks. Both operations are synchronous and require no additional dependencies beyond Node.js built-ins.

## Rationale

Supplying `projectRoot` as a parameter rather than reading `process.cwd()` inside the function makes the boundary explicit and lets tests pass a temp directory without patching global state. The caller (the verify pipeline) knows the project root from its own context.

Using `existsSync` rather than `stat`/`access` keeps the API synchronous and consistent with the structural and semantic validators. All four pipeline stages return their results synchronously from the caller's perspective; introducing async only at the paths stage would complicate the pipeline orchestrator.

Checking containment before existence ensures the function never reads paths outside the project root. A path that escapes gets a "path escapes" defect and skips the existence check.

`path.relative` correctly identifies escaping paths: if the relative path from `projectRoot` to the resolved target starts with `..`, the target is outside the project root.

## Trade-offs accepted

| Trade-off                      | Mitigation / reasoning                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Synchronous `existsSync`       | Acceptable for a CLI gate that runs once per invocation; async would complicate the pipeline with no gain |
| `projectRoot` passed by caller | Avoids global state; caller already knows the root; tests pass a temp directory without patching          |

## Invariants

- An empty `readonly string[]` return means no path defects
- For a given filesystem state, same verdict and same `projectRoot` always produce the same output
- Each defect string names the specific path that failed

## Compliance

### Recognized by

A single function receives an `AuditVerdict` and a `projectRoot` string, checks file paths against the filesystem, and returns an array of defect strings.

### MUST

- Resolve all paths relative to `projectRoot` ([review])
- Report "path escapes project root" when a path resolves outside `projectRoot` ([review])
- Report "missing file" naming the path when a path does not exist ([review])
- Check both `spec_file` and `test_file` fields in every finding ([review])

### NEVER

- Read, parse, or validate the content of referenced files — only check existence ([review])
- Check element presence or enum membership — those are structural concerns ([review])
- Throw exceptions — defects are reported as strings in the return value ([review])
