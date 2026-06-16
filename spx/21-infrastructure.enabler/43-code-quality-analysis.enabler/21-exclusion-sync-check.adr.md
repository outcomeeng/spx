# Fixture Exclusion Sync Check

A Lefthook pre-commit hook enforces that the `testing/fixtures` entries in `.sonarcloud.properties` `sonar.exclusions` equal the tracked files under `testing/fixtures`, blocking a commit whose exclusion list has drifted from the fixture tree. The drift comparison is a pure function over two dependency-injected inputs — the tracked-file set and the parsed exclusion entries — and it runs as local hook machinery, never as a step in the `spx validation` product pipeline.

## Rationale

SonarQube Cloud automatic analysis does not honor wildcard patterns in `.sonarcloud.properties`, so the fixture exclusion is a hand-enumerated exact-path list that silently goes stale when a fixture file is added or removed. Enforcing the list against `git ls-files testing/fixtures` at commit time is the product applied to its own configuration — the same dogfooding class as the rebuild and test-runner hooks in `spx/21-infrastructure.enabler/43-precommit.enabler` — not a capability the product offers its users, so it belongs in Lefthook rather than in `spx validation`. A pure comparison over injected inputs keeps the git listing and the properties parsing at the boundary, so the drift logic is exercised with explicit inputs instead of process side effects.

## Invariants

- The drift verdict is symmetric and total: it reports the set of tracked fixture files absent from the exclusion entries and the set of exclusion entries under `testing/fixtures` absent from the tracked files; the verdict is clean exactly when both sets are empty.

## Verification

### Testing

- ALWAYS: parsing of `.sonarcloud.properties` resolves Java `.properties` backslash line continuation, so a multi-line `sonar.exclusions` value yields the same path set as the equivalent single-line value ([property])
- ALWAYS: the hook exits non-zero and names the offending paths when the sets differ, and exits zero when they match ([compliance])

### Audit

- ALWAYS: the drift comparison is a pure function over an injected expected set (tracked fixture files) and actual set (parsed `sonar.exclusions` entries under `testing/fixtures`), returning the missing and extra paths — no git or filesystem reads inside the comparison ([audit])
- ALWAYS: the `git ls-files testing/fixtures` listing and the `.sonarcloud.properties` read are reached through dependency-injected runners so the comparison is verifiable with explicit inputs ([audit])
- NEVER: the check runs as a step in the `spx validation` product pipeline — it enforces the product's own SonarQube Cloud configuration and is local hook machinery ([audit])
- NEVER: tests for the check replace git or filesystem modules through framework-level module replacement; they exercise real exported functions over explicit inputs ([audit])
