# Release Data

PROVIDES deterministic release data — the commits since the last release tag, the version delta, and the changed paths — computed from git without network access or LLM inference
SO THAT release-notes authoring, documentation sync, and publish dispatch
CAN operate on one accurate, reproducible description of what a release contains

## Assertions

### Scenarios

- Given a repository with a previous release tag, when release data is computed, then it lists the commits between that tag and the current HEAD ([review])
- Given no previous release tag exists, when release data is computed, then it reports the full commit history as the release contents ([review])

### Mappings

- The package version and the latest release tag map to the version delta — major, minor, or patch — for the release ([review])

### Properties

- Release-data computation is deterministic: the same repository state always produces the same release data ([review])

### Compliance

- NEVER: perform network access or invoke an LLM to compute release data — git plumbing and the local working tree are the only inputs ([review])
