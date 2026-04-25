# Verdict Reader Module

## Purpose

This decision governs the TypeScript module for parsing audit verdict XML files into a typed in-memory representation, including the XML parsing library choice, the `AuditVerdict` type shape, and the reader function's error contract.

## Context

**Business impact:** All three downstream verification stages (structural, semantic, paths) operate on the parsed representation rather than raw XML. A consistent type shared across stages eliminates re-parsing and ensures each stage receives the same view of the document.

**Technical constraints:** The reader must detect malformed XML and surface it as a concrete error. It must not validate schema, semantics, or path existence — those are downstream concerns. The `AuditVerdict` type must be permissive enough to represent well-formed XML that is structurally incomplete (missing required elements), since structural checking is the structural stage's responsibility.

## Decision

`fast-xml-parser` is the XML parsing library. It is a pure-JavaScript parser with TypeScript types, detects malformed XML and reports parse errors, and supports attribute parsing without a DOM runtime.

`src/audit/reader.ts` exports the `AuditVerdict` type, the component types (`AuditVerdictHeader`, `AuditGate`, `AuditFinding`), and the `readVerdictFile` function. Downstream stages import the type from this module.

`AuditVerdict` carries optional fields for all header children and gate children. This allows structurally incomplete documents (missing `<header>`, missing `<verdict>`, etc.) to be represented without the reader performing structural validation. The `gates` field defaults to an empty array when `<gates>` is absent. All fields are `readonly` to prevent downstream stages from mutating the parsed representation.

`readVerdictFile(filePath: string): Promise<AuditVerdict>` is the sole public reader function. It reads the file, parses it as XML, maps the parser output to `AuditVerdict`, and returns the result. No dependency injection of the file-system layer is required — the function's external boundary is the file path string, not a file-handle abstraction.

On ENOENT, `readVerdictFile` throws an `Error` whose message names the missing file path. On malformed XML, it throws an `Error` whose message identifies the file path and includes the parser's error detail.

## Rationale

`fast-xml-parser` is chosen over `@xmldom/xmldom` because it does not require a browser-like DOM runtime, integrates as a direct library call (no global state), and its parse result is a plain JavaScript object rather than a live DOM tree. The immutable-typed mapping step converts the loose parser output to the strict `AuditVerdict` type in one place, keeping downstream stages free of raw-parser knowledge.

Optional fields throughout `AuditVerdict` reflect that the reader's only obligation is well-formedness detection, not structural completeness. If the structural stage received only validated documents, it would have nothing to check. The reader returns whatever was in the XML; the structural stage narrows that to required-field presence.

Exporting `AuditVerdict` from `src/audit/reader.ts` co-locates the type with the function that produces it. Downstream stages do not need their own type definitions; they import from the reader module, making the dependency direction explicit: structural/semantic/paths all import from reader, never from each other.

No dependency injection of `readFile` is warranted. The module's external boundary is a file path string; the caller supplies that path, making the file-system read integral to the function's contract rather than an injectable concern. A file-system abstraction would add an interface layer without isolating any independently testable logic — the only logic worth exercising is the path → parsed-representation mapping, which requires a real file.

## Trade-offs accepted

| Trade-off                                           | Mitigation / reasoning                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Adding `fast-xml-parser` as a production dependency | The package is widely adopted and maintained; no lighter-weight alternative detects malformed XML reliably     |
| `AuditVerdict` fields are optional, not strict      | Structural validation is the downstream stage's concern; a strict type would force the reader to do validation |
| Reader module exports both types and function       | Co-location of type and producer is clearer than a separate `src/audit/types.ts` with no producer              |

## Invariants

- `readVerdictFile` either returns a fully constructed `AuditVerdict` or throws — it never returns a partial result
- All fields in `AuditVerdict`, `AuditGate`, and `AuditFinding` are `readonly`
- `AuditVerdict.gates` is always a (possibly empty) array, never `undefined`

## Compliance

### Recognized by

A single `readVerdictFile` function in a single module reads and parses verdict XML. Downstream stage modules import `AuditVerdict` from that module. No XML parsing occurs outside the reader module.

### MUST

- Export `AuditVerdict`, `AuditVerdictHeader`, `AuditGate`, `AuditFinding` from `src/audit/reader.ts` — shared type contract for all stages ([review])
- Throw an `Error` naming the file path on ENOENT ([review])
- Throw an `Error` naming the file path on malformed XML ([review])
- Set all `AuditVerdict`, `AuditGate`, and `AuditFinding` fields as `readonly` — prevents downstream mutation of the parsed representation ([review])
- Default `AuditVerdict.gates` to an empty array when `<gates>` is absent — structural stage handles the "missing gates" defect; reader must not throw ([review])

### NEVER

- Validate structural completeness (required element presence) in the reader — that is the structural stage's responsibility ([review])
- Validate enum membership (`APPROVED`/`REJECT`, `PASS`/`FAIL`/`SKIPPED`) in the reader — that is the structural stage's responsibility ([review])
- Validate path existence in the reader — that is the paths stage's responsibility ([review])
- Import or depend on `src/audit/testing/harness.ts` in the production reader module — harness is test infrastructure only ([review])
