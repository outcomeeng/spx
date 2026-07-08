# Code Quality Analysis

PROVIDES a repository-root SonarQube Cloud configuration, project-side exclusion scopes, and MCP server registration — server-side automatic analysis of the product's own source on every push and pull request, with deliberate test-fixture inputs and product-owned issue exceptions excluded, and an agent-queryable findings interface
SO THAT the product's maintainers and the agents working on it
CAN surface code-quality, security, and reliability findings on the source without a continuous-integration analysis step, and inspect those findings through SonarQube tooling

## Assertions

### Compliance

- ALWAYS: a repository-root `.sonarcloud.properties` configures SonarQube Cloud automatic analysis — the only in-repository artifact the server-side analysis requires ([audit])
- ALWAYS: deliberate test-fixture inputs under `testing/fixtures` are excluded from analysis through the SonarQube Cloud project Analysis Scope with a single `testing/fixtures/**` scope so fixtures are not analyzed as product source ([audit])
- ALWAYS: SonarQube Cloud Issues > Ignore Issues on Multiple Criteria ignores `typescript:S2699` for `**/*.property.l1.test.ts`, `typescript:S1135` for `**/session*/**/*.ts`, and `typescript:S2187` for `**/*ast-enforcement.enabler/tests/*.l1.test.ts` ([audit])
- ALWAYS: a repository-root `.mcp.json` registers a SonarQube MCP server bound to the product's SonarQube Cloud project so agents can query its findings ([audit])
- NEVER: a continuous-integration workflow performs the SonarQube Cloud analysis — automatic analysis runs server-side, so no GitHub Actions job runs it ([audit])
- ALWAYS: the project's SonarQube Cloud quality gate fails on any new issue, any new duplicated line, or any unreviewed new security hotspot ([audit])
- ALWAYS: the project's SonarQube Cloud quality gate fails on any overall bug, vulnerability, unreviewed security hotspot, or duplicated block ([audit])
- ALWAYS: code-quality enforcement governed by `spx/21-infrastructure.enabler/43-code-quality-analysis.enabler/15-local-quality-enforcement.adr.md` runs locally through the deterministic ESLint mirror, with server-side SonarQube Cloud automatic analysis as the cloud backstop ([audit])
- ALWAYS: the mirror declares type-aware parser options and a rule set — drawn from `eslint-plugin-sonarjs`, `@typescript-eslint`, ESLint core, `eslint-plugin-import`, `eslint-plugin-unicorn`, and the product's custom `spx` plugin — that ESLint enforces, reporting a finding on source that violates a mirrored rule ([test](tests/eslint-mirror.compliance.l1.test.ts))
- ALWAYS: the mirror runs each rule at one of two enforcement tiers — an error tier whose severity blocks `spx validation` on any finding, and a warn tier whose severity surfaces findings without blocking — with the array-sort-comparator, cognitive-complexity, pseudo-random, redundant-assertion, object-has-own, duplicate-import, and uppercase task-marker comment classes configured in the error tier and the unicorn-family classes in the warn tier while their backlog is uncleared ([test](tests/eslint-mirror.compliance.l1.test.ts))
- ALWAYS: `buildEslintConfig` composes the mirror (type-aware parser options and the mirror rule set) into the flat config `spx validation lint` runs ([audit])
