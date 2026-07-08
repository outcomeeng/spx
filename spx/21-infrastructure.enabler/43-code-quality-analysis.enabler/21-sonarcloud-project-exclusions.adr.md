# SonarCloud Project Exclusions

SonarQube Cloud project settings carry automatic-analysis exclusions that are owned by the SonarQube Cloud UI rather than `.sonarcloud.properties`:

- Analysis Scope excludes deliberate test fixtures from automatic analysis with `testing/fixtures/**`.
- Issues > Ignore Issues on Multiple Criteria ignores `typescript:S2699` for `**/*.property.l1.test.ts`.
- Issues > Ignore Issues on Multiple Criteria ignores `typescript:S1135` for `**/session*/**/*.ts`.
- Issues > Ignore Issues on Multiple Criteria ignores `typescript:S2187` for `**/*ast-enforcement.enabler/tests/*.l1.test.ts`.

`.sonarcloud.properties` carries no fixture-exclusion list or issue-exclusion list, fixture additions require no local exclusion regeneration, and no commit-boundary hook enforces exclusion-list drift or local SonarQube analysis.

## Rationale

The fixture tree is intentionally large and change-prone because validation, test, and markdown evidence use it as inert input data. Enumerating every fixture file in `.sonarcloud.properties` couples ordinary fixture additions to SonarQube configuration churn and requires a local hook to keep the list synchronized. SonarQube Cloud automatic analysis owns analysis-scope exclusions server-side, where the product configuration can carry the subtree scope without repository churn.

The issue exclusions are product-owned exceptions for test-evidence and session implementation surfaces where the rule is intentionally inapplicable to the file class. Keeping them in the SonarQube Cloud UI prevents automatic analysis from requiring wildcard syntax in `.sonarcloud.properties`, where wildcard patterns are not supported.

## Verification

### Testing

- NEVER: `.sonarcloud.properties` carries SonarQube Cloud fixture-exclusion or issue-exclusion configuration ([compliance])
- NEVER: Lefthook declares a pre-commit or pre-push command for SonarQube fixture-exclusion synchronization or analysis ([compliance])

### Audit

- ALWAYS: SonarQube Cloud project Analysis Scope excludes the fixture subtree with `testing/fixtures/**` ([audit])
- ALWAYS: SonarQube Cloud Issues > Ignore Issues on Multiple Criteria carries exactly these rule/file-pattern entries: `typescript:S2699` for `**/*.property.l1.test.ts`, `typescript:S1135` for `**/session*/**/*.ts`, and `typescript:S2187` for `**/*ast-enforcement.enabler/tests/*.l1.test.ts` ([audit])
