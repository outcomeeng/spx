# Release Publication Dispatch

`spx release publish` is the single resumable publication operation for a verified release. It consumes committed release data and generated artifacts, confirms or creates the provenance-bearing package publication, and then reconciles one GitHub Release whose body is the exact validated changelog section for the verified tag.

## Rationale

Package publication is immutable for one name and version, while a GitHub Release is repairable. Confirming the package before changing the hosted release prevents a public release page from claiming availability that the registry does not provide. Treating an already-published package as a verified state rather than blindly publishing again lets the same operation repair a missing or stale GitHub Release after a partial failure.

One product operation keeps registry identity checks, changelog-section extraction, hosted-release reconciliation, and retry semantics under the release capability instead of duplicating them in workflow scripts. Pure orchestration and injected registry and repository-host boundaries preserve deterministic behavior verification while production adapters retain the environment-specific npm and GitHub authority. This refines `spx/26-release.enabler/18-release-architecture.adr.md` and `spx/14-cli-composition.adr.md`.

## Invariants

- Successful dispatch implies that the verified package identity exists with provenance and exactly one GitHub Release for the tag exposes the validated changelog section.
- Repeated dispatch with the same verified release inputs converges on the same registry and GitHub state without attempting a duplicate package publication.
- GitHub Release mutation occurs only after package publication is confirmed for the verified release identity.

## Verification

- ALWAYS: release-publication orchestration receives typed release data, a validated changelog section, a package publisher, and a repository-host release publisher through explicit inputs and injected interfaces
- ALWAYS: package publication confirmation compares the existing registry record with the verified package name, version, tagged commit identity, and provenance requirements before treating the package as published
- ALWAYS: GitHub Release reconciliation derives the tag, title, target commit, and body from the verified release inputs and performs an idempotent create-or-update operation only after package confirmation succeeds
- ALWAYS: the package-publishing adapter receives OIDC trusted-publishing authority without repository-content write permission, and the GitHub-release adapter receives repository-content write permission without package-registry identity-token authority
- NEVER: publication orchestration invokes a model, regenerates release prose, or accepts independently authored GitHub Release content
- NEVER: workflow scripts reimplement release identity checks, changelog-section extraction, retry classification, or hosted-release reconciliation owned by `spx release publish`
- NEVER: `vi.mock()`, `jest.mock()`, module replacement, or filesystem replacement substitutes for the injected package and repository-host publisher boundaries
