# Artifact Journal Store

PROVIDES the per-run artifact naming and the prior-run hydration that make the runner-local appendable store of `spx/18-state.enabler/71-appendable-journal-store.enabler` the github-pr journal's durable backend — the verification workflow's upload and download steps retaining a sealed run under its per-run artifact name and restoring a pull request's prior runs, which hydration materializes into the runs directory
SO THAT agentic verification runs executing in GitHub Actions
CAN durably retain across the ephemeral runner, replay each run's event history, and read the pull request's prior runs through the journal interface, while the process performs only runner-local-file I/O and never touches the network or the Actions runtime

## Assertions

### Scenarios

- Given a pull request whose prior runs of one verification type the workflow restored into the staging directory, when a run of that type opens, then hydration materializes each restored prior run into the runs directory and it replays identically through the journal interface ([test](tests/artifact-journal-store.scenario.l1.test.ts))

### Properties

- A sealed run's restored file materialized into the runs directory re-reads through a fresh appendable store and replays the identical events in ascending `seq` order ([test](tests/artifact-journal-store.property.l1.test.ts))

### Compliance

- ALWAYS: a run's per-run artifact name is addressed by pull request, verification type, and run token, so changing any one yields a distinct name and concurrent jobs retain disjoint artifacts ([test](tests/artifact-journal-store.compliance.l1.test.ts))
- ALWAYS: hydration materializes only restored runs whose name carries the run's own pull-request-and-type prefix, so another verification type's runs of the same pull request are never materialized ([test](tests/artifact-journal-store.compliance.l1.test.ts))
- ALWAYS: hydration skips a restored run whose run-token segment is not a valid scope token, so a malformed or adversarial network-sourced name cannot redirect a hydrated write outside the runs directory ([test](tests/artifact-journal-store.compliance.l1.test.ts))
- ALWAYS: hydration materializes each restored prior run as sealed — writing its seal marker alongside its events — so a hydrated run reports sealed and rejects a further append ([test](tests/artifact-journal-store.compliance.l1.test.ts))
- ALWAYS: hydration's materialized set is exactly the restored runs present in the staging directory — a prior run the workflow did not restore, its artifact expired or pruned, is absent rather than a hydration failure ([test](tests/artifact-journal-store.compliance.l1.test.ts))
- ALWAYS: hydration materializes only restored artifact directories, skipping a staging entry that is a plain file, so a stray file in the staging directory does not fail the opening run ([test](tests/artifact-journal-store.compliance.l1.test.ts))
- ALWAYS: hydration and the per-run naming perform only runner-local-file I/O through an injected `StateStoreFileSystem`, importing no Actions-artifact toolkit and constructing no `gh` artifact request, so they verify over a controlled filesystem without a network, per `spx/21-infrastructure.enabler/43-github-ci.enabler/21-artifact-journal-store.enabler/21-artifact-journal-store-architecture.adr.md` ([audit])
