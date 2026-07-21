# Review Run Projection

PROVIDES review envelope, reviewed-unit, and comment projection over validated review terminal metadata and review evidence from `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/21-review-evidence-model.enabler`, plus review's finding-identity and reviewed-unit connection to the run-set context projection from `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler`
SO THAT review producers, GitHub backends, local renderers, and other delivery surfaces
CAN render formal-review-shaped evidence from individual verification runs and restore prior-run review context without parsing rendered review text

## Assertions

### Scenarios

- Given a reviewed file with no finding, when review scope evidence is recorded, then the run projection includes the reviewed unit without adding a finding ([test](tests/review-scope.scenario.l1.test.ts))

### Mappings

- Review terminal metadata maps provider identity when present, actor, state, body, submitted time, commit identity, and URL when present into the review run projection ([test](tests/review-envelope.mapping.l1.test.ts))
- Review terminal metadata state maps `approved` to terminal status `approved`, maps `changes_requested` to terminal status `rejected`, and lets `commented` preserve the caller-supplied terminal status unless review evidence already determines rejection ([test](tests/review-envelope.mapping.l1.test.ts))
- Review comment input maps provider identity when present, path, line or position, side, original commit identity, diff hunk, body, URL when present, and SPX finding metadata into the review run projection ([test](tests/review-comment.mapping.l1.test.ts))

### Properties

- For every review run set, run evidence projects through the review finding-identity extractor and reviewed-unit scope key into active, resolved, reopened, and coverage-gap groups ([test](tests/review-run-set.property.l1.test.ts))

- Review finding identity composes the review verification type, the anchor side and path, and the SPX finding summary, and is invariant under changes to line, position, URL, provider identity, diff hunk, comment body, original commit, and finding disposition ([test](tests/review-run-set-identity.property.l1.test.ts))
- The reviewed-unit scope key composes the anchor side and path and is invariant under changes to commit, coverage state, line, position, URL, and provider identity ([test](tests/review-run-set-identity.property.l1.test.ts))
- Payload-shaped review identity adapters are total: a validated review payload maps through its schema fields and a non-conforming payload maps to a whole-payload canonical identity without throwing ([test](tests/review-run-set-identity.property.l1.test.ts))

### Compliance

- ALWAYS: review payload projection preserves provider identity and SPX finding metadata as structured fields rather than deriving review identity from rendered text ([audit])
- ALWAYS: review prior-run context consumes merge-period identity, run-set addressing, and the finding-identity key from `spx/34-verification.enabler/32-verify.enabler/54-run-set-orchestration.enabler` rather than redefining them ([audit])
