# Release Publication Dispatch

`spx release publish` is the single resumable publication operation for a verified release. It consumes committed release data and generated artifacts, confirms or creates the provenance-bearing package publication, and then reconciles one GitHub Release whose body is the exact validated changelog section for the verified tag.

## Rationale

Package publication is immutable for one name and version, while a GitHub Release is repairable. Confirming the package before changing the hosted release prevents a public release page from claiming availability that the registry does not provide. Treating an already-published package as a verified state rather than blindly publishing again lets the same operation repair a missing or stale GitHub Release after a partial failure.

One product operation keeps registry identity checks, changelog-section extraction, hosted-release reconciliation, and retry semantics under the release capability instead of duplicating them in workflow scripts. Pure orchestration and injected registry and repository-host boundaries preserve deterministic behavior verification while production adapters retain the environment-specific npm and GitHub authority. This refines `spx/26-release.enabler/18-release-architecture.adr.md` and `spx/14-cli-composition.adr.md`.

## Invariants

- Successful dispatch implies that the verified package identity exists with provenance and exactly one GitHub Release for the tag exposes the validated changelog section.
- Repeated dispatch with the same verified release inputs converges on the same registry and GitHub state without attempting a duplicate package publication.
- Package publication is attempted only from a product checkout whose head is the tagged commit, so the payload the registry receives and the commit it records are the tag's; a mismatch fails before the immutable publish rather than after it.
- GitHub Release mutation occurs only after package publication is confirmed for the verified release identity.

## Verification

### Testing

- ALWAYS: package publication confirmation compares an existing registry record with the verified package name, version, tagged commit identity, and provenance requirements before treating the package as published ([compliance])
- ALWAYS: a fresh publication's confirmation classifies each read before it waits — no record yet, or a record matching the verified name, version, and tagged commit but carrying no provenance, is re-read under a bounded backoff, while a record naming another name, version, or commit fails at once with the differing field named, and an exhausted backoff fails the publication with the hosted release unchanged ([compliance])
- ALWAYS: changelog-section extraction returns the exact validated section for the verified release version and rejects changelogs that omit that version or define it more than once ([compliance])
- ALWAYS: GitHub Release reconciliation derives the tag, title, target commit, and body from verified release inputs and performs an idempotent create-or-update operation only after package confirmation succeeds ([compliance])
- NEVER: a package publication is attempted from a product checkout whose head is not the tagged commit — publication fails before any package-registry or repository-host request ([compliance])
- ALWAYS: the publication workflow installs the packaged CLI's runtime dependencies and invokes `spx release publish` with the tag that triggered the run, only after deterministic verification, and grants the publication job the minimum combined authority of `contents: write` and `id-token: write`, while every other job retains read-only repository contents ([compliance])

### Audit

- ALWAYS: release-publication orchestration receives typed release data, a validated changelog section, a package publisher, a repository-host release publisher, and the confirmation's wait between attempts through explicit inputs and injected interfaces, so the orchestration holds no timer of its own ([audit])
- ALWAYS: package-registry and repository-host transport mechanics live with their owning backend concerns behind the injected publication boundaries ([audit])
- NEVER: publication orchestration invokes a model, regenerates release prose, or accepts independently authored GitHub Release content ([audit])
- NEVER: workflow scripts reimplement release identity checks, changelog-section extraction, retry classification, or hosted-release reconciliation owned by `spx release publish` ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, module replacement, or filesystem replacement substitutes for the injected package and repository-host publisher boundaries ([audit])
