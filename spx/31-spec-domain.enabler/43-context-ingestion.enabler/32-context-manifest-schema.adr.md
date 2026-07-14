# Context Manifest Schema

The spec context projection emits one versioned manifest whose document entries split into two classes: a read class — the totally ordered, complete set of documents a consumer reads to hold full node context — and a listed class — context the manifest names without requiring a read (co-located evidence files, non-lifecycle local overlays, same-index and higher-index sibling nodes). The manifest carries an integer `schemaVersion`, a snapshot-derived `bootstrap` flag, citing-file provenance on every cited-decision entry, and an opt-in content mode that embeds each read-class document's exact bytes as strict UTF-8 text with a raw-byte SHA-256 digest and byte count, failing the whole projection on any unreadable or non-UTF-8 document. This governs the machine-readable and human-readable projections of `spx spec context` and their implementation layering.

## Rationale

A consumer can retire manual context derivation only when one response is complete and self-describing: every read obligation explicit, every listed-but-not-read entry distinguishable without consulting the methodology, and the shape testable by version. Two entry classes make the read boundary structural rather than inferable from role names — a per-entry boolean on a single array was rejected because it interleaves non-read entries into the read order and lets consumers ignore the boundary field; a separate content command was rejected because two invocations reintroduce the incoherence one self-contained response removes. Citing-file provenance on cited decisions names why a decision outside the structural walk is in scope and where a stale citation is repaired. The read class orders role groups in a fixed sequence — product, ancestors, target, applicable decisions, lower-index siblings, coordination notes, runtime guides, cited decisions, lifecycle overlay — with a deterministic rule inside each group, so the array order is the consumption order and repeated runs over unchanged input are byte-identical.

The digest hashes the file's raw bytes before any decode: a decoded-text digest was rejected because it varies with decoder behavior while the byte identity is stable, cacheable, and verifiable by any consumer. Content mode decodes strictly as UTF-8 and aborts the whole projection on the first unreadable or undecodable document, naming the exact path — partial or silently substituted context is worse than a hard failure, and truncation is never permitted. Content stays opt-in so path-only consumers do not pay the payload cost. Per `spx/14-cli-composition.adr.md`, classification, ordering, citation extraction, and digest computation are pure domain functions over supplied inputs, while filesystem and git reads stay in the command handler behind injected dependencies; citation discovery scans only spec and decision documents in the read class — coordination notes, guides, and overlays never bind citations, because stale-prone workflow notes must not add read obligations.

## Invariants

- The read class is a total order: for equal tree content, repeated projections produce byte-identical output.
- Every cited-decision entry carries at least one citing path, and every citing path names a read-class spec or decision document.
- With content mode active, every read-class entry carries content, digest, and byte count; no listed-class entry ever does.
- The digest string names its algorithm and equals the hash of the file's raw bytes.
- `schemaVersion` changes exactly when the manifest shape changes incompatibly.

## Verification

### Audit

- ALWAYS: role classification, read-order construction, citation extraction, and digest computation are pure functions accepting all external state as parameters, with filesystem and git reads confined to the command handler per `spx/14-cli-composition.adr.md` ([audit])
- ALWAYS: the command handler reaches git through injected dependencies and reads documents only from the resolved worktree-local product directory, so tests exercise the real projection code paths over temp-directory fixtures ([audit])
- ALWAYS: the content-mode digest is computed over raw file bytes before text decoding, and the digest value names its algorithm ([audit])
- ALWAYS: content mode decodes documents as strict UTF-8, and the first read or decode failure aborts the entire projection with a diagnostic naming the exact failing path ([audit])
- NEVER: content mode truncates, elides, or substitutes any read-class document's bytes ([audit])
- NEVER: a listed-class entry carries document content, a digest, or a byte count ([audit])
- NEVER: citation discovery treats coordination notes, guides, or overlays as citation sources — citations bind only from read-class spec and decision documents ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or filesystem interception replaces the projection or read boundary in tests — tests construct real spec trees under temp directories through the shared test environment ([audit])
