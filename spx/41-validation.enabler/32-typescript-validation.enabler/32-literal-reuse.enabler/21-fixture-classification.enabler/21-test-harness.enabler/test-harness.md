# Fixture Classification Test Harness

PROVIDES `collectFromFile`, which collects a file's literal occurrences through the production `collectLiterals` under detector options built from the production minimum-string-length, minimum-number-digits, and visitor-key constants
SO THAT the fixture-classification enabler's L1 tests, which exercise how the collector skips fixture-data literals
CAN collect occurrences over generated source and fixture snippets without re-specifying the detector's collect options

## Assertions

### Scenarios

- Given a source snippet declaring a domain literal, when `collectFromFile` runs, then the returned occurrences include that literal as a string occurrence ([test](tests/test-harness.scenario.l1.test.ts))

### Compliance

- ALWAYS: the detector options are built from the production `DEFAULT_MIN_STRING_LENGTH`, `DEFAULT_MIN_NUMBER_DIGITS`, and default visitor-key constants, so the harness's collection matches the detector under test ([audit])
- ALWAYS: `collectFromFile` is pure — it performs no filesystem, subprocess, or network I/O ([audit])
