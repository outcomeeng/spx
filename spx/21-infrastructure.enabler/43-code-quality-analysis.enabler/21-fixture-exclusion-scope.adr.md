# Fixture Exclusion Scope

`.sonarcloud.properties` excludes deliberate test fixtures from SonarQube Cloud automatic analysis with the single `testing/fixtures/**` glob. Fixture additions require no local exclusion regeneration, and no pre-commit hook enforces exclusion-list drift.

## Rationale

The fixture tree is intentionally large and change-prone because validation, test, and markdown evidence use it as inert input data. Enumerating every fixture file in `.sonarcloud.properties` couples ordinary fixture additions to SonarQube configuration churn and requires a local hook to keep the list synchronized. A single subtree glob preserves the product intent — fixtures are not product source — while removing commit-time drift checking from the local loop. The server-side automatic analysis remains the authority that confirms whether the cloud service accepts the configured exclusion scope.

## Verification

### Audit

- ALWAYS: `.sonarcloud.properties` excludes the fixture subtree with `testing/fixtures/**` rather than enumerating fixture files ([audit])
- NEVER: Lefthook declares a pre-commit command to synchronize SonarQube fixture exclusions ([audit])
