# Release Data

PROVIDES deterministic release data — the commits since the previous release tag, the version delta, and the changed paths — computed from git without network access or LLM inference
SO THAT release-notes authoring, documentation sync, and publish dispatch
CAN operate on one accurate, reproducible description of what a release contains

## Assertions

### Scenarios

- Given a previous release tag exists, when release data is computed for a release at HEAD, then it lists the commits between the most recent release tag preceding the release and HEAD ([test](tests/release-data.scenario.l1.test.ts))
- Given the release commit is itself tagged, when release data is computed, then the delta anchors on the prior release tag rather than the tag at the release commit, so the release is not empty ([test](tests/release-data.scenario.l1.test.ts))
- Given no previous release tag exists, when release data is computed, then it reports the full commit history as the release contents ([test](tests/release-data.scenario.l1.test.ts))
- Given commits change paths since the previous release tag, when release data is computed, then the changed paths list the paths modified between that tag and HEAD ([test](tests/release-data.scenario.l1.test.ts))

### Mappings

- The package version and the previous release tag map to the version delta — major, minor, or patch — for a release whose version advances beyond the previous tag ([test](tests/release-data.mapping.l1.test.ts))

### Properties

- Release-data computation is deterministic: the same repository state always produces the same release data ([test](tests/release-data.property.l1.test.ts))

### Compliance

- NEVER: perform network access or invoke an LLM to compute release data — git plumbing and the local working tree are the only inputs ([test](tests/release-data.compliance.l1.test.ts))
