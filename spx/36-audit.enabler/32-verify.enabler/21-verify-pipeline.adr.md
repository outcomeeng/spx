# Verify Pipeline Module

## Purpose

This decision governs the TypeScript module that orchestrates the four-stage audit verdict verification pipeline: reader → structural → semantic → paths.

## Context

**Business impact:** The verify pipeline is the entry point for `spx audit verify <file>`. Consumers call a single function and receive a list of formatted defect lines and an exit code. The four-stage sequential design means a defect in an early stage prevents later stages from operating on potentially malformed data.

**Technical constraints:** The pipeline composes four modules already governed by their own ADRs: the reader (`readVerdictFile`), structural (`validateStructure`), semantic (`validateSemantics`), and paths (`validatePaths`) validators. The pipeline must not duplicate their logic. The reader is asynchronous (file I/O); the other three are synchronous. The pipeline is therefore async.

## Decision

The verify pipeline module exports a single async function `runVerifyPipeline(filePath: string, projectRoot: string): Promise<VerifyOutput>` where `VerifyOutput` is `{ readonly lines: readonly string[]; readonly exitCode: 0 | 1 }`.

`lines` contains formatted defect strings, each conforming to `{stage}: {message}`. `exitCode` is `0` when all stages pass (lines is empty) and `1` when any stage fails.

The pipeline runs stages in order, stopping at the first stage that produces defects:

1. Reader: called with `filePath`. If it throws, the error message is formatted as `reader: {message}` and the pipeline stops with exit code 1.
2. Structural: called with the parsed verdict. If it returns defects, each is formatted as `structural: {defect}` and the pipeline stops with exit code 1.
3. Semantic: called with the parsed verdict. If it returns defects, each is formatted as `semantic: {defect}` and the pipeline stops with exit code 1.
4. Paths: called with the parsed verdict and `projectRoot`. If it returns defects, each is formatted as `paths: {defect}` and the pipeline stops with exit code 1.

If all stages pass, the pipeline returns `{ lines: [], exitCode: 0 }`.

## Rationale

A single `runVerifyPipeline` function with a typed `VerifyOutput` return gives the CLI caller everything it needs: lines to write to stdout and an exit code. Separating these concerns from the CLI layer keeps the pipeline testable without Commander.js.

Stopping at the first failing stage follows from the dependency chain: structural defects leave the verdict in an undefined state for semantic validation; semantic defects leave findings in an undefined state for path checking. Running later stages on a defective verdict would produce noise, not signal.

Catching the reader's thrown error and formatting it as a `reader:` line maintains the invariant that defect messages are always strings in `lines`, not exceptions the caller must handle separately.

## Trade-offs accepted

| Trade-off                        | Mitigation / reasoning                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Sequential stop on first failure | Downstream stages are semantically dependent on earlier ones; noise from later stages on bad data is not actionable |
| `projectRoot` passed by caller   | Consistent with the paths validator's contract; caller controls the project root                                    |

## Invariants

- `exitCode === 0` if and only if `lines.length === 0`
- Each element of `lines` matches `^(reader|structural|semantic|paths):`
- Same file + same filesystem state always produces the same output

## Compliance

### Recognized by

A single async function receives a file path and project root, orchestrates the four validation stages, and returns formatted lines with an exit code.

### MUST

- Return `exitCode: 0` when all stages pass and `exitCode: 1` when any stage fails ([review])
- Format each defect as `{stage}: {message}` ([review])
- Stop after the first failing stage ([review])
- Catch reader exceptions and report them as `reader: {message}` lines ([review])

### NEVER

- Duplicate validation logic from the reader, structural, semantic, or paths modules ([review])
- Write to the filesystem or modify the verdict file ([review])
- Throw exceptions — errors are reported as `reader:` lines in the return value ([review])
