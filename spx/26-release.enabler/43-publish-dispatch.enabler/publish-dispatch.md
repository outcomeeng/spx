# Publish Dispatch

PROVIDES governed publication of a release — version-to-tag verification and a provenance-bearing publish that carries the release's generated notes and documentation
SO THAT a tagged release
CAN reach its registry with verified provenance, its release notes, and its updated documentation

## Assertions

### Scenarios

- Given a release tag and the package version, when publish dispatch verifies them, then it proceeds only when the tag equals the package version prefixed with `v` (tag `v1.2.3` for version `1.2.3`) and fails otherwise ([test](tests/publish-dispatch.scenario.l1.test.ts))
- Given a verified release tag, committed generated release artifacts, and registry publication authority, when `spx release publish` completes, then the package registry contains the release with provenance and GitHub exposes one release for that tag whose title names the tag, whose target is the tagged commit containing the generated documentation, and whose body equals the exact validated changelog section for the released version ([test](tests/publish-dispatch.scenario.l1.test.ts))
- Given the package registry already contains the same release identity while the matching GitHub Release is absent or carries different generated content, when `spx release publish` is invoked again, then it performs no duplicate package publication and reconciles the GitHub Release to the exact validated changelog section ([test](tests/publish-dispatch.scenario.l1.test.ts))
- Given the package registry contains the release version with an identity or provenance that does not match the verified release, when `spx release publish` runs, then publication fails and the GitHub Release remains unchanged ([test](tests/publish-dispatch.scenario.l1.test.ts))

### Compliance

- ALWAYS: publication carries build provenance through the registry's trusted-publishing mechanism ([audit])
- NEVER: model the product's own pre-publish validation and test gates as release dependencies — running them before publishing is self-application, governed by the product's release workflow rather than the release spec tree ([audit])
