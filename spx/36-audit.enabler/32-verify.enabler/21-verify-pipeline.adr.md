# Verify Pipeline Module

The verify pipeline splits file loading from validation. `runVerifyFilePipeline(filePath, productDir)` lives in `src/commands/audit/verify.ts`, reads and parses the audit verdict file, delegates parsed verdicts and injected path-existence behavior to the pure `runVerifyPipeline(verdict, productDir, dependencies)` in `src/domains/audit/verify.ts`, stops at the first stage that produces defects, and returns a typed `VerifyOutput` of formatted stage-prefixed defect lines and an exit code.

## Rationale

A typed `VerifyOutput` gives the CLI caller everything it needs — lines to write, an exit code, and the verdict value to print on success — and keeping that separate from the Commander layer makes the pipeline testable without Commander. Stopping at the first failing stage follows the dependency chain: structural defects leave the verdict undefined for semantic validation, and semantic defects leave findings undefined for path checking, so running later stages on a defective verdict produces noise. Catching command reader errors in the file pipeline and formatting them as `reader:` lines keeps defect messages uniformly strings in `lines`, never exceptions the caller must handle separately, and `productDir` is supplied by the caller to match the paths validator's contract. The command file pipeline supplies the real file-existence reader; the domain pipeline stays pure by receiving it as a dependency. The file pipeline is async because verdict-file reading is asynchronous; the domain pipeline is pure validation over the parsed `AuditVerdict`.

## Invariants

- `runVerifyFilePipeline(filePath, productDir)` returns `VerifyOutput`, which is `{ readonly lines: readonly string[]; readonly exitCode: 0 | 1; readonly verdict?: string }`.
- `runVerifyPipeline(verdict, productDir, dependencies)` returns the same `VerifyOutput` shape without reading files.
- On the success path (`exitCode === 0`), `VerifyOutput.verdict` carries the `<verdict>` element value from the parsed `AuditVerdict.header`; on the failure path it is absent.
- `exitCode === 0` if and only if `lines.length === 0`.
- Each element of `lines` matches `^(reader|structural|semantic|paths):`.
- The same file, the same filesystem state, and the same injected dependencies always produce the same output.

## Verification

### Audit

- ALWAYS: return `exitCode: 0` when all stages pass and `exitCode: 1` when any stage fails ([audit])
- ALWAYS: format each defect as `{stage}: {message}` ([audit])
- ALWAYS: stop after the first failing stage ([audit])
- ALWAYS: catch command reader exceptions in `runVerifyFilePipeline` and report them as `reader: {message}` lines ([audit])
- ALWAYS: keep `runVerifyPipeline` free of filesystem and process access; it accepts a parsed `AuditVerdict`, `productDir`, and injected path-existence dependency as parameters ([audit])
- NEVER: duplicate validation logic from the composed modules `readVerdictFile`, `parseAuditVerdictXml`, `validateStructure`, `validateSemantics`, or `validatePaths` — each is governed by its own ADR ([audit])
- NEVER: write to the filesystem or modify the verdict file ([audit])
- NEVER: throw exceptions from `runVerifyFilePipeline` for reader errors — errors are reported as `reader:` lines in the return value ([audit])
