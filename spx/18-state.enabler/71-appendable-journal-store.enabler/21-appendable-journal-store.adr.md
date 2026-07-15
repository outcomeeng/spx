# Appendable Journal Store Binding

The agent-run-journal's `AppendableBackend` port is implemented under `src/lib/` as a module that persists each event to a deterministic per-sequence JSONL record through the atomic publication contract of `spx/18-state.enabler/43-record-store.enabler/21-atomic-jsonl-publication.adr.md`. The sequence record path is a pure function of the caller-resolved run file path and event sequence. Each `append` serializes the complete event to a unique temporary sibling and atomically hard-links it to that sequence path; a destination collision rejects with `JOURNAL_ERROR.SEQ_CONSUMED`. `readAll` combines conformant per-sequence records with a conformant aggregate run file when one exists, deduplicates by sequence with the atomic sequence record authoritative, and returns events in ascending sequence order.

The caller-resolved run file remains the retained single-artifact representation. `seal` materializes the ordered sequence records into that aggregate JSONL file before writing the seal marker, so artifact retention and hydration continue to carry one run file plus its marker. An interrupted active run reopens from its sequence records; a hydrated sealed run with no local sequence records reopens from the aggregate. Every filesystem operation flows through the injected `StateStoreFileSystem`; temporary-name generation is injected with a production default.

## Rationale

The journal contract names no backend, so the local store binds its port without changing `append`, `readAll`, `seal`, or `isSealed`. A complete per-sequence record published by hard link makes sequence allocation and event persistence one atomic visibility boundary: before publication the deterministic sequence path is absent and retryable; after publication it names the complete event and a fresh process replays it. An empty claim followed by a separate aggregate append is rejected because termination between those operations leaves a permanent claim with no event. Read-then-clear recovery is also rejected because a second process can mistake a live writer's claim for a stale one and publish the same sequence.

Per-sequence JSONL records keep active-run appends independent and no-overwrite while preserving the record store's serialization. Materializing the aggregate only at seal avoids concurrent append races in the retained file. Reading the aggregate as a fallback preserves hydrated sealed runs produced by artifact storage, while sequence-record precedence prevents a stale aggregate line from overriding the atomic record for its sequence.

Deriving seal state from a marker file rather than a sentinel event keeps every persisted journal record a CloudEvent. Taking a resolved run file path keeps git topology and `.spx/` scope derivation in the state module per `spx/17-state.adr.md`.

## Invariants

- The run file, sequence-record, temporary-record, and seal-marker paths are pure functions of their declared inputs.
- A deterministic sequence path is absent before publication and contains one complete conformant event after publication.
- Each sequence has at most one authoritative event, and a collision leaves that event unchanged.
- `readAll` returns every authoritative event exactly once in ascending sequence order across active, restarted, sealed, and hydrated histories.
- The seal marker is written only after the aggregate run file contains the ordered replay of every authoritative sequence record.

## Verification

### Testing

- ALWAYS: overlapping appends through backend instances sharing one run path publish an incoming sequence at most once, preserve a replay with unique contiguous sequences, and reject every conflict with `JOURNAL_ERROR.SEQ_CONSUMED` ([property])
- ALWAYS: interruption before atomic sequence-record publication leaves the sequence reusable through a fresh backend, while interruption after publication leaves the complete event replayable and advances the next append by exactly one ([compliance])
- ALWAYS: sealing materializes the complete ordered replay into the aggregate run file, and a hydrated backend with only that aggregate and its seal marker replays the same history ([compliance])

### Audit

- ALWAYS: the store implements `AppendableBackend` with kind Appendable and never widens the `append` / `readAll` / `seal` / `isSealed` contract, per `spx/15-agent-run-journal.enabler/32-journal-module-structure.adr.md` ([audit])
- ALWAYS: every filesystem read and write flows through an injected `StateStoreFileSystem`; the store imports no direct filesystem API and re-derives no git topology or `.spx/` layout, per `spx/17-state.adr.md` ([audit])
- ALWAYS: active events publish through the record store's atomic JSONL publication contract, and seal materialization uses the record store's JSONL serialization ([audit])
- ALWAYS: deterministic sequence-path collisions map to `JOURNAL_ERROR.SEQ_CONSUMED` rather than a store-local error ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or module interception substitutes for the filesystem — tests inject a controlled `StateStoreFileSystem` and exercise the real store code paths, per `spx/17-state.adr.md` ([audit])
- NEVER: the store treats an absent aggregate line as evidence that an existing sequence path is stale or safe to remove ([audit])
