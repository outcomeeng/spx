# Open Issues

## First property test composes its own classification literal `spx/31-spec-domain.enabler/21-node-status.enabler/32-node-status-test-support.enabler/tests/node-status-test-support.property.l1.test.ts` `materializes generated classification facts and resolves recorded evidence` `test-owned configuration`

Severity: WARNING. Remediation target: harness.

The first property test composes its own classification literal { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL } from harness enums, while the sibling property tests use the harness-owned PROPERTY_CLASSIFICATION.SMALL_L1. The run-count tier is chosen in the test file. The seed, run count and replay output stay owned by assertProperty, so this is non-blocking.

**Settlement condition:** the first property test uses PROPERTY_CLASSIFICATION.SMALL_L1.

## Repeated committed-test discovery and exclusion read-back `testing/harnesses/node-status/node-status.ts` `the committed-test discovery block and the spx/EXCLUDE read-back block that the property tests repeat` `repeated-observation-derivation`

Severity: WARNING. Remediation target: harness.

testing/harnesses/node-status/node-status.ts: two blocks repeat across tests. One is the committed-test discovery (evidencePrefix, tracked filter, single-test check, link check) in the two repository-commit tests. The other is the spx/EXCLUDE read-back and sort in the classification-tree and status-writer-tree tests. Both are assertion-local projections over observations, so they are not blocking. A harness helper returning the observation, with the predicate left in the test, would remove the repetition.

**Settlement condition:** the harness owns one committed-test discovery and one spx/EXCLUDE read-back.
