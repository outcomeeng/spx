# Verdict Reader Module

The verdict reader is a single async function, `readVerdictFile(filePath)`, that parses an audit verdict XML file with `fast-xml-parser` into an immutable, fully-typed `AuditVerdict` that every downstream stage imports. It detects only well-formedness, throwing an `Error` that names the file path on a missing file or malformed XML. Schema, semantic, and path validation are left to the downstream stages.

## Rationale

`fast-xml-parser` is chosen over `@xmldom/xmldom` because it needs no browser-like DOM runtime, integrates as a direct library call with no global state, and yields a plain JavaScript object rather than a live DOM tree; an immutable-typed mapping step converts that loose parser output to the strict `AuditVerdict` type in one place, keeping downstream stages free of raw-parser knowledge. Fields are optional throughout because the reader's only obligation is well-formedness detection, not structural completeness — if the structural stage received only validated documents it would have nothing to check, so the reader returns whatever the XML held and the structural stage narrows it to required-field presence. Exporting `AuditVerdict` and its component types from `reader.ts` co-locates the type with the function that produces it and makes the dependency direction explicit: structural, semantic, and paths all import from the reader, never from each other.

## Invariants

- `readVerdictFile` either returns a fully constructed `AuditVerdict` or throws — it never returns a partial result.
- All fields in `AuditVerdict`, `AuditGate`, and `AuditFinding` are `readonly`.
- `AuditVerdict.gates` is always a (possibly empty) array, never `undefined`.

## Verification

### Audit

- ALWAYS: export `AuditVerdict`, `AuditVerdictHeader`, `AuditGate`, and `AuditFinding` from `src/domains/audit/reader.ts` — the shared type contract for all stages ([audit])
- ALWAYS: throw an `Error` naming the file path on ENOENT ([audit])
- ALWAYS: throw an `Error` whose message names the file path and includes the parser's error detail on malformed XML ([audit])
- ALWAYS: set all `AuditVerdict`, `AuditGate`, and `AuditFinding` fields `readonly` — prevents downstream mutation of the parsed representation ([audit])
- ALWAYS: default `AuditVerdict.gates` to an empty array when `<gates>` is absent — the structural stage handles the missing-gates defect, so the reader must not throw ([audit])
- NEVER: validate structural completeness (required-element presence) in the reader — that is the structural stage's responsibility ([audit])
- NEVER: validate enum membership (`APPROVED`/`REJECT`, `PASS`/`FAIL`/`SKIPPED`) in the reader — that is the structural stage's responsibility ([audit])
- NEVER: validate path existence in the reader — that is the paths stage's responsibility ([audit])
- NEVER: inject the filesystem layer through an interface abstraction — the file path string is the module's external boundary, so the read is integral to the contract ([audit])
- NEVER: import or depend on `testing/harnesses/audit/harness.ts` in the production reader module — the harness is test infrastructure only ([audit])
