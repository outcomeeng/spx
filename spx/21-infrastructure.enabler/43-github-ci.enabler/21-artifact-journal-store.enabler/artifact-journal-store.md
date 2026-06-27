# Artifact Journal Store

PROVIDES a GitHub Appendable backend that persists an agent-run journal's events as a JSONL run history and durably retains each sealed run as a per-run GitHub Actions artifact, binding the `AppendableBackend` port of `spx/15-agent-run-journal.enabler` and hydrating a pull request's prior runs from their retained artifacts
SO THAT agentic verification runs executing in GitHub Actions
CAN store, durably retain, and replay each run's event history — and read the pull request's prior runs — through the journal interface across the ephemeral runner, without the journal itself touching the network or the Actions runtime

## Assertions

### Scenarios

- Given a pull request whose prior runs of one verification type are retained as Actions artifacts, when a run of that type opens, then each retained prior run's event history is hydrated and replays identically through the journal interface ([test](tests/artifact-journal-store.scenario.l1.test.ts))

### Properties

- A sealed run's event history retained as an Actions artifact and re-read through a fresh backend replays the identical events in ascending `seq` order ([test](tests/artifact-journal-store.property.l1.test.ts))

### Compliance

- ALWAYS: an `append` writes the runner-local JSONL run history and durable retention happens once at `seal`, so a run performs no per-append network write ([test](tests/artifact-journal-store.compliance.l1.test.ts))
- ALWAYS: each sealed run is retained as a distinct per-run artifact addressed by its pull request, verification type, and run token, so concurrent jobs never collide and the readable run set is the union of the type's retained artifacts ([test](tests/artifact-journal-store.compliance.l1.test.ts))
- ALWAYS: hydration lists only artifacts of the run's own pull request and verification type, so another verification type's runs of the same pull request are never materialized or read as this type's ([test](tests/artifact-journal-store.compliance.l1.test.ts))
- ALWAYS: re-sealing an already-retained run is a no-op that uploads no second artifact, so a retried seal does not conflict on the run's artifact name ([test](tests/artifact-journal-store.compliance.l1.test.ts))
- ALWAYS: `seal` marks the run terminally sealed before it retains the body, so a sealed run rejects every further append and no event can interleave between a failed seal and a retry to diverge the retained record from the local one ([test](tests/artifact-journal-store.compliance.l1.test.ts))
- ALWAYS: retention is ensured independently of the seal marker — a retention failure leaves the run sealed-but-unretained, and a later seal re-attempts the upload rather than stranding the run without a durable artifact ([test](tests/artifact-journal-store.compliance.l1.test.ts))
- ALWAYS: a prior run whose artifact retention has expired is skipped at hydration rather than failing the opening run, so the readable run set is the pull request's still-retained runs ([test](tests/artifact-journal-store.compliance.l1.test.ts))
- ALWAYS: hydration skips an artifact whose run-token segment is not a valid scope token, so a malformed or adversarial network-sourced artifact name cannot redirect a hydrated write outside the runs directory ([test](tests/artifact-journal-store.compliance.l1.test.ts))
- ALWAYS: a hydrated prior run replays as sealed — a run materialized from its retained artifact reports sealed and rejects a further append — so the durable record's terminal seal survives hydration ([test](tests/artifact-journal-store.compliance.l1.test.ts))
- ALWAYS: the backend declares its kind as Appendable and binds the journal's `AppendableBackend` port without widening the `append`/`readAll`/`seal`/`isSealed` contract, per `spx/15-agent-run-journal.enabler/32-journal-module-structure.adr.md` ([audit])
- ALWAYS: every GitHub Actions artifact and runtime access routes through an injected client interface — re-deriving no Actions runtime and importing no network client — so the store's dispatch verifies over a controlled client without a network, mirroring `spx/21-infrastructure.enabler/43-github-ci.enabler/21-snapshot-adapter.enabler` ([audit])
