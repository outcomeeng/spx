# Appendable Journal Store Binding

The agent-run-journal's `AppendableBackend` port is implemented under `src/lib/` as a module that persists each event to a deterministic per-sequence JSONL record through the atomic publication contract of `spx/18-state.enabler/43-record-store.enabler/21-atomic-jsonl-publication.adr.md`. The sequence record path is a pure function of the caller-resolved run file path and event sequence. Each `append` serializes the complete event to a unique temporary sibling and atomically hard-links it to that sequence path; a destination collision rejects with `JOURNAL_ERROR.SEQ_CONSUMED`. `readAll` returns conformant per-sequence records in ascending sequence order whenever any sequence records exist. It reads the aggregate run file only when the history is sealed and no sequence records exist, the retained hydrated-artifact shape.

The caller-resolved run file remains the retained single-artifact representation. `seal` first creates or reuses a persisted sealing marker, hard-links the opened run file to a stable creation marker, removes unpublished sequence-record temporary siblings while an appendable-journal classifier protects every valid sequence-record destination, snapshots the now-stable sequence records, and routes complete aggregate replacement through the shared atomic file-write primitive with an aggregate-specific temporary-path factory and exclusive-create retry policy before writing the sealed marker and removing the sealing marker. Aggregate temporary siblings remain owned by the seal attempt that created them; another seal neither removes nor overwrites them. The creation marker preserves the original run-file inode and birthtime while aggregate replacement changes the inode at the retained path. `append` evaluates the absence of both seal markers through the atomic publisher's guard after writing its complete temporary event and immediately before hard-link publication. A blocked publication maps to `JOURNAL_ERROR.SEALED`. Artifact retention and hydration continue to carry one run file plus its sealed marker; hydrated runs without a local creation marker use the retained run file's metadata. An interrupted active run reopens from its sequence records; a hydrated sealed run with no local sequence records reopens from the aggregate. Every filesystem operation flows through the injected `StateStoreFileSystem`; temporary-name generation is injected with a production default.

## Rationale

The journal contract names no backend, so the local store binds its port without changing `append`, `readAll`, `seal`, or `isSealed`. A complete per-sequence record published by hard link makes sequence allocation and event persistence one atomic visibility boundary: before publication the deterministic sequence path is absent and retryable; after publication it names the complete event and a fresh process replays it. An empty claim followed by a separate aggregate append is rejected because termination between those operations leaves a permanent claim with no event. Read-then-clear recovery is also rejected because a second process can mistake a live writer's claim for a stale one and publish the same sequence.

Per-sequence JSONL records keep active-run appends independent and no-overwrite while preserving the record store's serialization. A backend instance enumerates the current immutable sequence paths once per replay request and caches every conformant parsed record by sequence, so later appends and replays read only sequence paths that instance has not inspected. The sealing marker establishes a durable publication barrier before the snapshot. An append whose hard link wins before barrier cleanup is committed and included in the snapshot; cleanup that removes the temporary sibling first causes the append to reject without publishing. Appends that begin after the barrier write complete temporary events, observe the barrier in the publication guard, and reject without publishing. The sequence-record set is therefore stable after cleanup even when another process stops at any point in append or seal.

Materializing the aggregate only at seal avoids concurrent append races in the retained file. The shared atomic file-write primitive writes the aggregate through a complete temporary sibling and atomic rename, while the journal-supplied path factory makes interrupted temporaries recovery-addressable and the exclusive-create policy prevents concurrent seal retries from overwriting or removing one another's siblings. A stale aggregate temporary is inert because later seals choose a unique exclusive-create path and never publish or delete another attempt's sibling. The sealed marker is written only after that rename. An interruption before the sealed marker leaves the sealing marker in place, keeps appends blocked, and permits a later `seal` call to repeat sequence cleanup and materialization. An interruption after the sealed marker leaves a complete aggregate and sealed history even if sealing-marker cleanup did not run. Aggregate fallback is restricted to a sealed history with no local sequence records, preserving hydrated runs produced by artifact storage without treating an unsealed aggregate-only file as a supported active journal.

Hard-linking the opened run file to the deterministic creation-marker path preserves its inode birthtime without copying partially materialized aggregate bytes or mutating filesystem timestamps. Concurrent or retried seals treat an existing marker as the completed creation-metadata publication. A process stop before aggregate replacement leaves both hard links naming the original opened file; a later seal reuses the marker and completes replacement. Run discovery reads the marker's birthtime when present and falls back to the run file for retained artifacts created without the local marker.

Deriving seal state from a marker file rather than a sentinel event keeps every persisted journal record a CloudEvent. Taking a resolved run file path keeps git topology and `.spx/` scope derivation in the state module per `spx/17-state.adr.md`.

## Invariants

- The run file, sequence-record, temporary-record, creation-marker, sealing-marker, and sealed-marker paths are pure functions of their declared inputs.
- A deterministic sequence path is absent before publication and contains one complete conformant event after publication.
- Each sequence has at most one authoritative event, and a collision leaves that event unchanged.
- Each backend instance reads an immutable sequence record at most once and reuses its parsed event for later appends, reads, renders, and sealing.
- Before aggregate replacement, the creation marker hard-links the opened run-file inode and preserves its birthtime across seal retries and process interruption.
- Once the sealing marker exists, every in-flight append either has already published a complete sequence record included by sealing or rejects without publication.
- A sealing interruption leaves a persisted recovery state that blocks appends until a later seal completes.
- `readAll` returns every authoritative event exactly once in ascending sequence order from sequence records, or from the aggregate only when the history is sealed and no sequence records exist.
- The sealed marker is written only after an atomic aggregate replacement contains the ordered replay of every authoritative sequence record.

## Verification

### Testing

- ALWAYS: overlapping appends through backend instances sharing one run path publish an incoming sequence at most once, preserve a replay with unique contiguous sequences, and reject every conflict with `JOURNAL_ERROR.SEQ_CONSUMED` ([property])
- ALWAYS: interruption before atomic sequence-record publication leaves the sequence reusable through a fresh backend, while interruption after publication leaves the complete event replayable and advances the next append by exactly one ([compliance])
- ALWAYS: interruption during aggregate seal materialization leaves every sequence record replayable, writes no seal marker, and permits a later seal to rematerialize the complete aggregate ([compliance])
- ALWAYS: overlapping append and seal either includes the complete appended event in the sealed aggregate or rejects that append with `JOURNAL_ERROR.SEALED`, and hydrated replay never loses a successful append ([property])
- ALWAYS: overlapping seals preserve each attempt's exclusively created aggregate temporary and complete with the same ordered hydrated replay ([property])
- ALWAYS: interruption after the sealing marker persists blocks appends, and a later seal recovers the stale barrier into a complete sealed aggregate ([compliance])
- ALWAYS: each replay request enumerates sequence records once, and repeated appends and replays through one backend instance read each immutable sequence record at most once ([compliance])
- Given an opened run file, when sealing replaces its inode with the aggregate, then the stable creation marker preserves the opened inode's filesystem birthtime ([scenario])
- ALWAYS: sealing materializes the complete ordered replay into the aggregate run file, and a hydrated backend with only that aggregate and its seal marker replays the same history ([compliance])

### Audit

- ALWAYS: the store implements `AppendableBackend` with kind Appendable and never widens the `append` / `readAll` / `seal` / `isSealed` contract, per `spx/15-agent-run-journal.enabler/32-journal-module-structure.adr.md` ([audit])
- ALWAYS: every filesystem read and write flows through an injected `StateStoreFileSystem`; the store imports no direct filesystem API and re-derives no git topology or `.spx/` layout, per `spx/17-state.adr.md` ([audit])
- ALWAYS: active events publish through the record store's atomic JSONL publication contract, and seal materialization uses the record store's JSONL serialization ([audit])
- ALWAYS: aggregate replacement routes through the shared atomic file-write primitive with an injected aggregate temporary-path factory, exclusive-create collision classifier, and bounded retry count ([audit])
- ALWAYS: seal establishes the persisted sealing barrier before temporary-publication cleanup and sequence snapshot, then atomically replaces the aggregate before writing the sealed marker ([audit])
- ALWAYS: seal hard-links the opened run file to its deterministic creation marker before aggregate replacement, and an existing marker makes retry idempotent ([audit])
- ALWAYS: deterministic sequence-path collisions map to `JOURNAL_ERROR.SEQ_CONSUMED` rather than a store-local error ([audit])
- ALWAYS: publication blocked by sealing maps to `JOURNAL_ERROR.SEALED` rather than a store-local error ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or module interception substitutes for the filesystem — tests inject a controlled `StateStoreFileSystem` and exercise the real store code paths, per `spx/17-state.adr.md` ([audit])
- NEVER: the store treats an absent aggregate line as evidence that an existing sequence path is stale or safe to remove ([audit])
- NEVER: an unsealed aggregate-only file participates in active-run replay; aggregate fallback requires a persisted seal marker and no sequence records ([audit])
