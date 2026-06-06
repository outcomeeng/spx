# Release Data

PROVIDES deterministic release data — the commits since the last release tag, the version delta, and the changed paths — computed from git without network access or LLM inference
SO THAT release-notes authoring, documentation sync, and publish dispatch
CAN operate on one accurate, reproducible description of what a release contains

## Assertions

### Scenarios

- Given a repository with a previous release tag, when release data is computed, then it lists the commits between that tag and the current HEAD ([test](tests/release-data.scenario.l1.test.ts))
- Given no previous release tag exists, when release data is computed, then it reports the full commit history as the release contents ([test](tests/release-data.scenario.l1.test.ts))

### Mappings

- The package version and the latest release tag map to the version delta — major, minor, or patch — for the release ([test](tests/release-data.mapping.l1.test.ts))

### Properties

- Release-data computation is deterministic: the same repository state always produces the same release data ([test](tests/release-data.property.l1.test.ts))

### Compliance

- NEVER: perform network access or invoke an LLM to compute release data — git plumbing and the local working tree are the only inputs ([test](tests/release-data.compliance.l1.test.ts))
