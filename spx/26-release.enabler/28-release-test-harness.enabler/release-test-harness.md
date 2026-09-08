# Release Test Harness

PROVIDES release-specific real-filesystem environments, controlled agent, filesystem, package-registry, and repository-host boundaries, Keep a Changelog and documentation oracles, case registration, cleanup, and diagnostics driven by coherent release scenarios
SO THAT release-data, release-notes, documentation-sync, and publish-dispatch evidence
CAN exercise production behavior with explicit failure controls and without repeating environment construction, dependency bags, or assertion configuration

## Assertions

### Compliance

- ALWAYS: the harness consumes domains from `spx/26-release.enabler/24-release-test-generators.enabler` and owns reusable release setup, dependency controls, cleanup, execution policy, and failure diagnostics ([audit])
- ALWAYS: release scenarios materialize in isolated real product directories, and cleanup removes staged artifacts and temporary directories on success and failure while preserving the original result ([audit])
- ALWAYS: filesystem success paths use the real filesystem and controlled dependencies are limited to the testing methodology's named exception cases ([audit])
- ALWAYS: controlled package and repository-host publishers implement production-owned interfaces and expose requests and state transitions as observations without deciding whether the asserted behavior passed ([audit])
- NEVER: executed release test files construct release paths, dependency bags, runner settings, reusable values, or cleanup policy; they register harness cases and assert the governed outcome ([audit])
- NEVER: harness modules redeclare production-owned release vocabulary or derive related release values independently of the release test generator ([audit])
