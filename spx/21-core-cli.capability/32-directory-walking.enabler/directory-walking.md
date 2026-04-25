# Directory Walking

PROVIDES the Scanner class — a configurable directory walker that discovers work items from a specs root using patterns and path helpers derived from the supplied config
SO THAT every spx command that enumerates work items
CAN obtain path-based work item lists through a single injectable instance with no hardcoded paths

## Assertions

### Scenarios

- Given a Scanner constructed with a custom config specifying a non-default specs root, when the scanner resolves paths, then getSpecsRootPath returns the custom root ([test](tests/directory-walking.scenario.l1.test.ts))
- Given a Scanner constructed with a custom config specifying a non-default work directory, when getWorkPath is called, then the returned path is under the custom specs root ([test](tests/directory-walking.scenario.l1.test.ts))
- Given a Scanner constructed with custom statusDirs where doing is named "in-progress", when getDoingPath is called, then the returned path contains "in-progress" ([test](tests/directory-walking.scenario.l1.test.ts))
- Given a Scanner constructed with a custom config, when getBacklogPath and getDonePath are called, then each returns a path rooted under the custom specs root ([test](tests/directory-walking.scenario.l1.test.ts))
- Given a Scanner constructed with a full custom config, when all path helper methods are called together, then all paths are consistent with the custom config values and none reference default path literals ([test](tests/directory-walking.scenario.l1.test.ts))

### Compliance

- ALWAYS: every path the Scanner exposes is derived from the config it was constructed with — no module-scope constants or hardcoded path literals appear in the Scanner implementation ([review])
