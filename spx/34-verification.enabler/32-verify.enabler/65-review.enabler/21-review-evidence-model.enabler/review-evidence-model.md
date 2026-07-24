# Review Evidence Model

PROVIDES review evidence validation over platform-neutral review envelopes, reviewed units, and anchored review comments
SO THAT review producers, GitHub backends, local renderers, and other delivery surfaces
CAN validate review payloads without requiring provider-specific command vocabulary

## Assertions

### Conformance

- Review envelope payloads conform to the platform-neutral review envelope schema: provider identity when present, actor, state, body, submitted time, commit identity, and optional URL ([test](tests/review-payload.conformance.l1.test.ts))
- Review scope payloads conform to the platform-neutral reviewed-unit schema: provider identity when present, path, optional line or position range, side, commit identity, coverage state, and optional URL ([test](tests/review-payload.conformance.l1.test.ts))
- Review finding payloads conform to the platform-neutral review comment schema while accepting GitHub-shaped anchor fields as optional provider data and requiring SPX finding metadata when a review comment represents a finding ([test](tests/review-payload.conformance.l1.test.ts))

### Properties

- Review payload validation accepts local review comments and provider-backed review comments without requiring GitHub provider fields for every backend ([test](tests/review-payload.property.l1.test.ts))

### Compliance

- ALWAYS: review scope and finding payloads validate through the shared verification-type evidence-validator registry before journal events append ([audit])
- ALWAYS: a review scope or finding payload rejection reason names the failing payload field path or the unmet structural requirement ([test](tests/review-evidence-validation.compliance.l1.test.ts))
