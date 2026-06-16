# Code Quality Analysis

PROVIDES a repository-root SonarCloud configuration and MCP server registration — server-side automatic analysis of the product's own source on every push and pull request, with deliberate test-fixture inputs excluded, and an agent-queryable findings interface
SO THAT the product's maintainers and the agents working on it
CAN surface code-quality, security, and reliability findings on the source without a continuous-integration analysis step, and inspect those findings through SonarQube tooling

## Assertions

- ALWAYS: a repository-root `.sonarcloud.properties` configures SonarCloud automatic analysis — the only in-repository artifact the server-side analysis requires ([audit])
- ALWAYS: deliberate test-fixture inputs under `testing/fixtures` are excluded from analysis so fixtures are not analyzed as product source ([audit])
- ALWAYS: a repository-root `.mcp.json` registers a SonarQube MCP server bound to the product's SonarCloud project so agents can query its findings ([audit])
- NEVER: a continuous-integration workflow performs the SonarCloud analysis — automatic analysis runs server-side, so no GitHub Actions job runs it ([audit])
