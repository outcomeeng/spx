# Review Evidence Model

PROVIDES review evidence validation and projection over platform-neutral review envelopes, reviewed units, and anchored review comments
SO THAT review producers, GitHub backends, local renderers, and other delivery surfaces
CAN record clean reviewed units and validated review findings without requiring provider-specific command vocabulary

## Assertions

### Scenarios

- Given a reviewed file with no finding, when review scope evidence is recorded, then the run projection includes the reviewed unit without adding a finding ([test](tests/review-scope.scenario.l1.test.ts))

### Mappings

- Review envelope input maps provider identity when present, actor, state, body, submitted time, commit identity, and URL when present into the review run projection ([test](tests/review-envelope.mapping.l1.test.ts))
- Review comment input maps provider identity when present, path, line or position, side, original commit identity, diff hunk, body, URL when present, and SPX finding metadata into the review run projection ([test](tests/review-comment.mapping.l1.test.ts))

### Conformance

- Review scope payloads conform to the platform-neutral reviewed-unit schema: provider identity when present, path, optional line or position range, side, commit identity, coverage state, and optional URL ([test](tests/review-payload.conformance.l1.test.ts))
- Review finding payloads conform to the platform-neutral review comment schema while accepting GitHub-shaped anchor fields as optional provider data and requiring SPX finding metadata when a review comment represents a finding ([test](tests/review-payload.conformance.l1.test.ts))

### Properties

- Review payload validation accepts local review comments and provider-backed review comments without requiring GitHub provider fields for every backend ([test](tests/review-payload.property.l1.test.ts))

### Compliance

- ALWAYS: review finding payloads validate through the shared verification-type finding-validator registry before journal events append ([audit])
