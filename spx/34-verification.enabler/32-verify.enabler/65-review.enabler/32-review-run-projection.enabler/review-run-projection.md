# Review Run Projection

PROVIDES review envelope and comment projection over validated review evidence and run-set identity
SO THAT review producers, GitHub backends, local renderers, and other delivery surfaces
CAN render formal-review-shaped evidence without redefining merge-period finding identity

## Assertions

### Mappings

- Review envelope input maps provider identity when present, actor, state, body, submitted time, commit identity, and URL when present into the review run projection ([test](tests/review-envelope.mapping.l1.test.ts))
- Review comment input maps provider identity when present, path, line or position, side, original commit identity, diff hunk, body, URL when present, and SPX finding metadata into the review run projection ([test](tests/review-comment.mapping.l1.test.ts))

### Compliance

- ALWAYS: review payload projection consumes merge-period identity and finding identity from `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler` rather than redefining run-set identity locally ([audit])
