# Fixture Classification

PROVIDES the test-vs-source-vs-fixture classification logic — recognizes test-file paths via POSIX, Windows, and `.test.` filename markers, identifies fixture-writer call positions whose arguments are setup data rather than assertion-position semantics, and identifies fixture-data variable identifiers whose contents are payload rather than domain semantics
SO THAT [21-detection.enabler](../21-detection.enabler/detection.md) building the literal index
CAN distinguish file paths and string payloads inside test fixtures (which contribute zero occurrences) from assertion-position semantic literals (which contribute occurrences) without flagging a false-positive on every test that writes a path or a JSON payload to disk

## Assertions

### Scenarios

- Given a test file contains fixture-writer paths and source payload strings, when literals are collected, then those setup literals do not contribute occurrences while assertion-position semantic literals still contribute occurrences ([test](tests/fixture-classification.scenario.l1.test.ts))
- Given a fixture-writer call receives a nested function callback, when literals are collected, then literals inside the callback still contribute occurrences while the fixture-writer path does not ([test](tests/fixture-classification.scenario.l1.test.ts))
- Given a fixture-writer call contains another fixture-writer call as its payload, when literals are collected, then both writer argument lists are treated as setup data ([test](tests/fixture-classification.scenario.l1.test.ts))
- Given a test file contains protocol or status values inside fixture data, when literals are collected, then those fixture values do not contribute occurrences while assertion-position semantic literals still contribute occurrences ([test](tests/fixture-classification.scenario.l1.test.ts))
- Given a test file destructures from an inline object expression, when literals are collected, then destructuring defaults and inline object values still contribute occurrences because no fixture object identifier names the data ([test](tests/fixture-classification.scenario.l1.test.ts))
- Given a test file stores fixture data in compound-role names or SCREAMING_SNAKE fixture identifiers, when literals are collected, then those fixture values do not contribute occurrences while assertion-position semantic literals still contribute occurrences ([test](tests/fixture-classification.scenario.l1.test.ts))
- Given a file path contains the `.test.` filename marker outside a tests directory, when literals are collected, then fixture-data filtering treats the file as test-authored while assertion-position semantic literals still contribute occurrences ([test](tests/fixture-classification.scenario.l1.test.ts))

### Compliance

- ALWAYS: test-file classification recognizes POSIX `/tests/`, Windows `\tests\`, and `.test.` filename markers as test fixture paths ([test](tests/fixture-classification.compliance.l1.test.ts))
- NEVER: add, remove, or rename fixture-writer helper methods without updating the detector's fixture-writer call classification in the same change ([test](tests/fixture-classification.compliance.l1.test.ts))
- NEVER: add words to the detector's fixture-data role segments that are also common non-fixture variable-name components without a corresponding test for the false-positive boundary ([review])
