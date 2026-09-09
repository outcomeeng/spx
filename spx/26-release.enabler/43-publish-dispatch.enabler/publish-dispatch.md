# Publish Dispatch

PROVIDES governed publication of a release — version-to-tag verification and a provenance-bearing publish that carries the release's generated notes and documentation
SO THAT a tagged release
CAN reach its registry with verified provenance, its release notes, and its updated documentation

## Assertions

### Scenarios

- Given a release tag and the package version, when publish dispatch verifies them, then it proceeds only when the tag equals the package version prefixed with `v` (tag `v1.2.3` for version `1.2.3`) and fails otherwise ([test](tests/publish-dispatch.scenario.l1.test.ts))
- Given a verified release tag, committed generated release artifacts, and registry publication authority, when `spx release publish` completes, then the package registry contains the release with provenance and GitHub exposes one release for that tag whose title names the tag, whose target is the tagged commit containing the generated documentation, and whose body equals the exact validated changelog section for the released version ([test](tests/publish-dispatch.scenario.l1.test.ts))
- Given the package registry already contains the same release identity while the matching GitHub Release is absent or carries different generated content, when `spx release publish` is invoked again, then it performs no duplicate package publication and reconciles the GitHub Release to the exact validated changelog section ([test](tests/publish-dispatch.scenario.l1.test.ts))
- Given the package registry contains the release version under a name, version, or commit that does not match the verified release, when `spx release publish` runs, then publication fails and the GitHub Release remains unchanged ([test](tests/publish-dispatch.scenario.l1.test.ts))
- Given a product checkout whose changelog file differs from the changelog committed at the release tag, when `spx release publish` reads the release artifacts, then the changelog it validates is the one committed at the tagged commit, whatever the checkout's changelog file holds ([test](tests/publish-dispatch.scenario.l1.test.ts))
- Given a release tag that names no commit in the product repository, when `spx release publish` resolves the tagged commit, then publication fails ([test](tests/publish-dispatch.scenario.l1.test.ts))
- Given a configured changelog path that names a committed directory, when `spx release publish` reads the changelog at the release tag, then publication fails ([test](tests/publish-dispatch.scenario.l1.test.ts))
- Given a publication that fails, when `spx release publish` reports the failure, then standard error carries the failure message escaped and unabridged and the process exits non-zero ([test](tests/publish-dispatch.scenario.l1.test.ts))

### Compliance

- ALWAYS: package publication confirmation compares an existing registry record with the verified package name, version, tagged commit identity, and provenance requirements before treating the package as published ([test](tests/publish-dispatch.compliance.l1.test.ts))
- ALWAYS: a fresh publication's confirmation classifies each read before it waits — no record yet, or a record matching the verified name, version, and tagged commit but carrying no provenance, is re-read under a bounded backoff, while a record naming another name, version, or commit fails at once with the differing field named, and an exhausted backoff fails the publication with the hosted release unchanged ([test](tests/publish-dispatch.compliance.l1.test.ts))
- ALWAYS: changelog-section extraction returns the exact validated section for the verified release version and rejects changelogs that omit that version or define it more than once ([test](tests/publish-dispatch.compliance.l1.test.ts))
- ALWAYS: GitHub Release reconciliation derives the tag, title, target commit, and body from verified release inputs and occurs only after package confirmation succeeds ([test](tests/publish-dispatch.compliance.l1.test.ts))
- ALWAYS: the publication workflow installs the packaged CLI's runtime dependencies and invokes `spx release publish` with the tag that triggered the run, only after deterministic verification, and grants the publication job `contents: write` and `id-token: write`, while every other job retains read-only repository contents ([test](tests/publish-dispatch.compliance.l1.test.ts))
- NEVER: a package-registry or repository-host command that cannot be spawned or is terminated by a signal is treated as a completed run — publication fails, while a completed command reports its own exit code ([test](tests/publish-dispatch.compliance.l1.test.ts))
- NEVER: a configured changelog path that escapes the product directory or names the directory itself is read at the release tag — publication rejects it, while a path inside the product directory maps to its committed tree path ([test](tests/publish-dispatch.compliance.l1.test.ts))
- NEVER: a package publication is attempted from a product checkout whose head is not the tagged commit — `spx release publish` fails before any package-registry or repository-host request ([test](tests/publish-dispatch.compliance.l1.test.ts))
- ALWAYS: publication carries build provenance through the registry's trusted-publishing mechanism ([audit])
- NEVER: model the product's own pre-publish validation and test gates as release dependencies — running them before publishing is self-application, governed by the product's release workflow rather than the release spec tree ([audit])
