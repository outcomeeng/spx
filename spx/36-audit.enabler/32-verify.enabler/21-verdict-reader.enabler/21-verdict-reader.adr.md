# Verdict Reader Module

The verdict reader splits filesystem loading from XML parsing. `src/domains/audit/reader.ts` exposes the pure `parseAuditVerdictXml(xml, sourceLabel)` parser and the immutable `AuditVerdict` type imported by downstream stages; `src/commands/audit/reader.ts` exposes `readVerdictFile(filePath)`, reads the verdict XML file, and passes the file path as the parser source label. The reader detects only read failures and XML well-formedness; schema, semantic, and path validation are left to the downstream stages.

## Rationale

`fast-xml-parser` is chosen over `@xmldom/xmldom` because it needs no browser-like DOM runtime, integrates as a direct library call with no global state, and yields a plain JavaScript object rather than a live DOM tree; an immutable-typed mapping step converts that loose parser output to the strict `AuditVerdict` type in one place, keeping downstream stages free of raw-parser knowledge. Fields are optional throughout because the reader's parsing obligation is well-formedness detection, not structural completeness — if the structural stage received only validated documents it would have nothing to check, so the reader returns whatever the XML held and the structural stage narrows it to required-field presence. Keeping file reads in the command layer satisfies the CLI composition boundary while preserving the user-visible file-path diagnostics from `spx audit verify <file>`. Exporting `AuditVerdict` and its component types from `reader.ts` co-locates the type with the parser that produces it and makes the dependency direction explicit: structural, semantic, and paths all import from the reader, never from each other.

## Invariants

- `parseAuditVerdictXml` either returns a fully constructed `AuditVerdict` or throws — it never returns a partial result.
- `readVerdictFile` lives in the command layer and delegates XML interpretation to `parseAuditVerdictXml`.
- All fields in `AuditVerdict`, `AuditGate`, and `AuditFinding` are `readonly`.
- `AuditVerdict.gates` is always a (possibly empty) array, never `undefined`.

## Verification

### Audit

- ALWAYS: export `AuditVerdict`, `AuditVerdictHeader`, `AuditGate`, and `AuditFinding` from `src/domains/audit/reader.ts` — the shared type contract for all stages ([audit])
- ALWAYS: parse XML strings through `parseAuditVerdictXml(xml, sourceLabel)` in `src/domains/audit/reader.ts` and include `sourceLabel` in malformed XML errors ([audit])
- ALWAYS: read verdict files through `readVerdictFile(filePath)` in `src/commands/audit/reader.ts` and include `filePath` in read errors ([audit])
- ALWAYS: pass `filePath` as the parser source label from `readVerdictFile` so malformed XML errors identify the file ([audit])
- ALWAYS: set all `AuditVerdict`, `AuditGate`, and `AuditFinding` fields `readonly` — prevents downstream mutation of the parsed representation ([audit])
- ALWAYS: default `AuditVerdict.gates` to an empty array when `<gates>` is absent — the structural stage handles the missing-gates defect, so the reader must not throw ([audit])
- NEVER: validate structural completeness (required-element presence) in the reader — that is the structural stage's responsibility ([audit])
- NEVER: validate enum membership (`APPROVED`/`REJECT`, `PASS`/`FAIL`/`SKIPPED`) in the reader — that is the structural stage's responsibility ([audit])
- NEVER: validate path existence in the reader — that is the paths stage's responsibility ([audit])
- NEVER: import `node:fs`, `node:fs/promises`, process globals, or `src/commands/audit/` from `src/domains/audit/reader.ts` ([audit])
- NEVER: import or depend on `testing/harnesses/audit/harness.ts` in the production reader module — the harness is test infrastructure only ([audit])
