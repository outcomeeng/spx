# Issues

## agent-session-identity states a universal under a Scenario group

**Evidence:** In the test-evidence audit of the Change 361 Changeset at head `74e55f0df0336691fd0eb4547349f83b3861ace8`, the SPX Advisor found that `agent-session-identity` in [session-identity.spec.md](session-identity.spec.md) claims its outcome for every subset of the four identity variables, a universal over a finite set, while it stands in the Scenarios group. Methodology 4.0 states that a universal is never a Scenario, and gives a claim over every member of a finite set the Mapping type, with one table row per case.

**Impact:** The Assertion type misstates the claim, so a reader takes the Scenario for one example. An evidence audit then judges its tests against the wrong case design.

**Settlement condition:** `agent-session-identity` stands as a Test.Mapping subsection with one row for each subset of the four identity variables, and its test file carries the `mapping` assertion type.
