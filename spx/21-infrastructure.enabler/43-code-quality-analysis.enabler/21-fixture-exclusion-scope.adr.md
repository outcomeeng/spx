# Fixture Exclusion Scope

SonarQube Cloud project Analysis Scope excludes deliberate test fixtures from automatic analysis with the `testing/fixtures/**` scope configured in the project UI. `.sonarcloud.properties` carries no fixture-exclusion list, fixture additions require no local exclusion regeneration, and no pre-commit hook enforces exclusion-list drift.

## Rationale

The fixture tree is intentionally large and change-prone because validation, test, and markdown evidence use it as inert input data. Enumerating every fixture file in `.sonarcloud.properties` couples ordinary fixture additions to SonarQube configuration churn and requires a local hook to keep the list synchronized. SonarQube Cloud automatic analysis owns analysis-scope exclusions server-side, where the product configuration can carry the subtree scope without repository churn.

## Verification

### Audit

- ALWAYS: SonarQube Cloud project Analysis Scope excludes the fixture subtree with `testing/fixtures/**` while `.sonarcloud.properties` carries no fixture-exclusion list ([audit])
- NEVER: Lefthook declares a pre-commit command to synchronize SonarQube fixture exclusions ([audit])
