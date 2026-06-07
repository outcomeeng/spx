# Verify Pipeline Module

The verify pipeline is a single async function, `runVerifyPipeline(filePath, productDir)`, that runs the four validation stages in sequence, stopping at the first stage that produces defects, and returns a typed `VerifyOutput` of formatted stage-prefixed defect lines and an exit code.

## Rationale

A single function returning a typed `VerifyOutput` gives the CLI caller everything it needs — lines to write, an exit code, and the verdict value to print on success — and keeping that separate from the CLI layer makes the pipeline testable without Commander. Stopping at the first failing stage follows the dependency chain: structural defects leave the verdict undefined for semantic validation, and semantic defects leave findings undefined for path checking, so running later stages on a defective verdict produces noise, not signal. Catching the reader's thrown error and formatting it as a `reader:` line keeps defect messages uniformly strings in `lines`, never exceptions the caller must handle separately, and `productDir` is supplied by the caller to match the paths validator's contract. The pipeline is async because the reader performs asynchronous file I/O while the structural, semantic, and paths stages are synchronous.

## Invariants

- `runVerifyPipeline(filePath, productDir)` returns `VerifyOutput`, which is `{ readonly lines: readonly string[]; readonly exitCode: 0 | 1; readonly verdict?: string }`.
- On the success path (`exitCode === 0`), `VerifyOutput.verdict` carries the `<verdict>` element value from the parsed `AuditVerdict.header`; on the failure path it is absent.
- `exitCode === 0` if and only if `lines.length === 0`.
- Each element of `lines` matches `^(reader|structural|semantic|paths):`.
- The same file and the same filesystem state always produce the same output.

## Verification

### Audit

- ALWAYS: return `exitCode: 0` when all stages pass and `exitCode: 1` when any stage fails ([audit])
- ALWAYS: format each defect as `{stage}: {message}` ([audit])
- ALWAYS: stop after the first failing stage ([audit])
- ALWAYS: catch reader exceptions and report them as `reader: {message}` lines ([audit])
- NEVER: duplicate validation logic from the composed modules `readVerdictFile`, `validateStructure`, `validateSemantics`, or `validatePaths` — each is governed by its own ADR ([audit])
- NEVER: write to the filesystem or modify the verdict file ([audit])
- NEVER: throw exceptions — errors are reported as `reader:` lines in the return value ([audit])
