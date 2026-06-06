# Publish Dispatch

PROVIDES governed publication of a release — version-to-tag verification and provenance-bearing publish
SO THAT a tagged release
CAN reach its registry with verified provenance

## Assertions

### Scenarios

- Given a release tag and the package version, when publish dispatch verifies them, then it proceeds only when the tag matches the version and fails otherwise ([test](tests/publish-dispatch.scenario.l1.test.ts))

### Compliance

- ALWAYS: publication carries build provenance through the registry's trusted-publishing mechanism ([audit])
- NEVER: model the product's own pre-publish validation and test gates as release dependencies — running them before publishing is self-application, governed by the product's release workflow rather than the release spec tree ([audit])
