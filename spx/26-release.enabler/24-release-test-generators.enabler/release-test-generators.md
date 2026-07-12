# Release Test Generators

PROVIDES coherent generated release-data, changelog, documentation, commit, version, path, configuration, and failure-scenario domains composed from production-owned release contracts
SO THAT the release test harness and release behavior evidence
CAN explore meaningful release cases without assertion files or harnesses reconstructing protocol vocabulary, related paths, or dependent values

## Assertions

### Properties

- Every generated Keep a Changelog case agrees with the independent Markdown oracle for its generated release version and changelog structure ([test](tests/release-test-generators.property.l1.test.ts))

### Compliance

- ALWAYS: variable release input domains, shrinking, sampling, and replay data are owned by this generator rather than by executed test files or release harnesses ([audit])
- ALWAYS: release protocol tokens, changelog headings, version semantics, path grammar, and command vocabulary come from their production owners; the generator composes those contracts without redeclaring them ([audit])
- NEVER: independent arbitrary draws are used where release values have a semantic relationship; the generator emits one coherent scenario record for the consuming behavior ([audit])
