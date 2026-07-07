# Review Run Projection

PROVIDES review envelope, reviewed-unit, and comment projection over validated review terminal metadata and review evidence from `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/21-review-evidence-model.enabler`
SO THAT review producers, GitHub backends, local renderers, and other delivery surfaces
CAN render formal-review-shaped evidence from individual verification runs without parsing rendered review text

## Assertions

### Scenarios

- Given a reviewed file with no finding, when review scope evidence is recorded, then the run projection includes the reviewed unit without adding a finding ([test](tests/review-scope.scenario.l1.test.ts))

### Mappings

- Review terminal metadata maps provider identity when present, actor, state, body, submitted time, commit identity, and URL when present into the review run projection ([test](tests/review-envelope.mapping.l1.test.ts))
- Review comment input maps provider identity when present, path, line or position, side, original commit identity, diff hunk, body, URL when present, and SPX finding metadata into the review run projection ([test](tests/review-comment.mapping.l1.test.ts))

### Compliance

- ALWAYS: review payload projection preserves provider identity and SPX finding metadata as structured fields rather than deriving review identity from rendered text ([audit])
