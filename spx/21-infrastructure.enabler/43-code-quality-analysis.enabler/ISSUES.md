# Issues

## Exclusion list drifts from the fixture tree without enforcement

`sonar.exclusions` in [`.sonarcloud.properties`](../../../.sonarcloud.properties) enumerates every tracked file under `testing/fixtures/` by exact path, because SonarCloud automatic analysis does not accept wildcard patterns in `.sonarcloud.properties` ([automatic-analysis docs](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/automatic-analysis/)). The list is complete for the current tree but is maintained by hand: adding a fixture without updating the list silently reintroduces it to analysis, falsifying the second assertion in [`code-quality-analysis.md`](code-quality-analysis.md).

`sonar.python.version=3.13, 3.14` already suppresses the only concrete prior symptom (the Python version-imprecision warning) independent of this list, so the drift risk is limited to fixture issues reappearing, not the warning returning.

**Follow-up:** add a deterministic check (a `spx validation` step or a Lefthook pre-commit hook) that fails when `sonar.exclusions` does not match `git ls-files testing/fixtures/`, so the list cannot drift unnoticed. This is new validation infrastructure rather than a change to this enabler's config, so it is tracked here rather than built in the introducing change.
