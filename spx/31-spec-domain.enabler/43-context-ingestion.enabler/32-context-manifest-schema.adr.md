# Context Manifest Schema

The spec context projection emits one versioned manifest, at schema version 2, for one or more targets supplied to `spx spec context show <targets...>` — the command's only registered form, with no single-target registration or alias beside it. Document entries split into two classes: a read class — the totally ordered, complete set of documents a consumer reads to hold full context — and a listed class — context the manifest names without requiring a read: co-located evidence files, runtime guide files, non-lifecycle local overlays, same-index and higher-index sibling nodes, and the extended methodology catalog. The manifest carries an integer `schemaVersion`, a snapshot-derived `bootstrap` flag, citing-file provenance on every cited-decision entry, an opt-in content mode that embeds each read document's exact bytes as strict UTF-8 text with a raw-byte SHA-256 digest and byte count, and an opt-in methodology payload whose read entries carry their bodies in every output mode. Multiple targets compose into one deduplicated bundle with per-target coverage. This governs the machine-readable and human-readable projections of the context command and their implementation layering.

## Rationale

A consumer can retire manual context derivation only when one response is complete and self-describing: every read obligation explicit, every listed-but-not-read entry distinguishable without consulting the methodology, and the shape testable by version. Two entry classes make the read boundary structural rather than inferable from role names — a per-entry boolean on a single array was rejected because it interleaves non-read entries into the read order and lets consumers ignore the boundary field; a separate content command was rejected because two invocations reintroduce the incoherence one self-contained response removes. Citing-file provenance on cited decisions names why a decision outside the structural walk is in scope and where a stale citation is repaired.

Runtime guide files are listed, never read: guides are harness-ambient instructions the invoking agent already holds through its own channel, and their bytes dominate any content-bearing response that re-ships them, taxing every consumer for context the response did not need to carry. The manifest names each guide for locatability and binds no read obligation, no content, no digest, and no byte count to it.

The read class orders role groups in a fixed sequence — product, ancestors, target, applicable decisions, lower-index siblings, coordination notes, cited decisions, lifecycle overlay, methodology — with a deterministic rule inside each group, so the array order is the consumption order and repeated runs over unchanged input are byte-identical.

A multi-target bundle deduplicates by document path: a document shared across targets appears exactly once, carrying every target-role pair it holds, and a per-target coverage section maps each target to its ordered read sequence by reference into the deduplicated entry list, so any single target's complete read order is reconstructible from one response. Composition canonically orders the resolved target set by ordinal identity comparison before building the bundle, so every permutation of the same operands produces byte-identical structured output. Atomicity spans the bundle: any target's resolution failure or any required document failure fails the whole command, because a partial bundle is silently incomplete context — the failure mode this projection exists to eliminate. Repeated single-target responses were rejected as the multi-target shape because merging them agent-side discards shared-document identity and re-reads shared bytes once per target.

The digest hashes the file's raw bytes before any decode: a decoded-text digest was rejected because it varies with decoder behavior while the byte identity is stable, cacheable, and verifiable by any consumer. Content mode decodes strictly as UTF-8 and aborts the whole projection on the first unreadable or undecodable document, naming the exact path — partial or silently substituted context is worse than a hard failure, and truncation is never permitted. Content stays opt-in so path-only consumers do not pay the payload cost; methodology read entries carry their bodies in every output mode because their consumers are precisely the agents with no other access to the foundation.

Per `spx/14-cli-composition.adr.md` and `spx/23-spec-tree.enabler/spec-tree.md`, the projection's pure computation — target resolution, role classification, read-order construction, citation extraction, digest computation, and bundle composition — is spec-tree capability computation and lives in the spec-tree library behind its single public surface `src/lib/spec-tree/index.ts`; the command handler holds only product-root resolution, snapshot construction, and document byte reads through injected dependencies. Methodology-manifest validation is methodology capability computation governed by `spx/31-spec-domain.enabler/43-context-ingestion.enabler/65-understand-payload.enabler/21-methodology-source.adr.md`, not spec-tree computation. Citation discovery scans only spec and decision documents in the read class — coordination notes, guides, and overlays never bind citations, because stale-prone workflow notes must not add read obligations.

## Invariants

- The read class is a total order: for equal tree content and equal methodology resources, repeated projections produce byte-identical output.
- Every permutation of the same resolved target set produces byte-identical structured output.
- Every cited-decision entry carries at least one citing path, and every citing path names a read-class spec or decision document.
- With content mode active, every read-class entry carries content, digest, and byte count; no listed-class entry ever does.
- Methodology read entries carry their bodies in every output mode; methodology-catalog listed entries never carry a body.
- Each bundle entry names every target-role pair it holds, and each target's ordered read sequence is reconstructible by reference from the coverage section.
- The digest string names its algorithm and equals the hash of the file's raw bytes.
- `schemaVersion` changes exactly when the manifest shape changes incompatibly.

## Verification

### Testing

- ALWAYS: the context command registers exactly one form, `show`, accepting one or more target operands, and a single-target invocation preserves the documented single-target contract ([compliance])
- ALWAYS: the bundle deduplicates entries by document path, carries every target-role pair on each entry, and maps each target to its ordered read sequence by reference ([mapping])
- ALWAYS: resolved targets are canonically ordered before composition, so operand permutations produce byte-identical structured output ([property])
- NEVER: a guide file binds a read obligation or carries content, a digest, or a byte count ([compliance])
- NEVER: any target's resolution failure or required document failure yields a partial bundle ([compliance])
- ALWAYS: content mode decodes every read-class document as strict UTF-8 ([compliance])
- ALWAYS: the first read or decode failure in content mode aborts the entire projection with a diagnostic naming the exact failing path ([scenario])
- NEVER: content mode truncates, elides, or substitutes any read-class document's bytes ([property])
- NEVER: a listed-class entry carries document content, a digest, or a byte count ([compliance])

### Audit

- ALWAYS: pure projection computation lives in the spec-tree library behind `src/lib/spec-tree/index.ts`, and the command handler performs only product-root resolution, snapshot construction, and byte reads through injected dependencies ([audit])
- ALWAYS: role classification, read-order construction, citation extraction, digest computation, and bundle composition are pure functions accepting all external state as parameters, with filesystem and git reads confined to the command handler per `spx/14-cli-composition.adr.md` ([audit])
- ALWAYS: the command handler reaches git through injected dependencies and reads documents only from the resolved worktree-local product directory, so tests exercise the real projection code paths over temp-directory fixtures ([audit])
- ALWAYS: the content-mode digest is computed over raw file bytes before text decoding, and the digest value names its algorithm ([audit])
- NEVER: citation discovery treats coordination notes, guides, or overlays as citation sources — citations bind only from read-class spec and decision documents ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or filesystem interception replaces the projection or read boundary in tests — tests construct real spec trees under temp directories through the shared test environment ([audit])
