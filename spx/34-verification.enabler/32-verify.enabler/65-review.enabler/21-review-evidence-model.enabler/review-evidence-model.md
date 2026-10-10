# Review Evidence Model

PROVIDES review evidence validation over platform-neutral review envelopes, reviewed units, and anchored and unanchored review comments
SO THAT review producers, GitHub backends, local renderers, and other delivery surfaces
CAN validate review payloads without requiring provider-specific command vocabulary

## Assertions

### Conformance

- Review envelope payloads conform to the platform-neutral review envelope schema: provider identity when present, actor, state, body, submitted time, commit identity, and optional URL ([test](tests/review-payload.conformance.l1.test.ts))
- Review scope payloads conform to the platform-neutral reviewed-unit schema: provider identity when present, path, optional line or position range, side, commit identity, coverage state, and optional URL ([test](tests/review-payload.conformance.l1.test.ts))
- Review finding payloads conform to the platform-neutral review comment schema in one of two shapes, accepting GitHub-shaped anchor fields as optional provider data: an anchored finding carries a path, a line or position, a side, and a diff hunk; an unanchored finding carries none of line, position, side, and diff hunk, and carries a path when it concerns one path and no path when it concerns the changeset as a whole; every finding carries its original commit and body, and requires SPX finding metadata when a review comment represents a finding: a disposition `BLOCKING`, `DEBT`, `FILED`, or `STALE` and a summary; a `FILED` or `STALE` finding additionally carries the `ISSUES.md` entry reference — the note's path and the entry's heading — and a `FILED` finding additionally carries base-ref evidence, a location observable at the scope's base ref ([test](tests/review-payload.conformance.l1.test.ts))

### Properties

- Review payload validation accepts local review comments and provider-backed review comments without requiring GitHub provider fields for every backend ([test](tests/review-payload.property.l1.test.ts))

### Compliance

- ALWAYS: review scope and finding payloads validate through the shared verification-type evidence-validator registry before journal events append ([audit])
- ALWAYS: a review scope or finding payload rejection reason names the failing payload field path or the unmet structural requirement ([test](tests/review-evidence-validation.compliance.l1.test.ts))
- ALWAYS: a review finding carrying some but not all of line-or-position, side, and diff hunk is rejected before any journal event appends, naming the missing or extra field path ([test](tests/review-evidence-validation.compliance.l1.test.ts))
- ALWAYS: a `FILED` or `STALE` review finding without its entry reference, or a `FILED` finding without base-ref evidence, is rejected before any journal event appends, naming the missing field path ([test](tests/review-evidence-validation.compliance.l1.test.ts))
