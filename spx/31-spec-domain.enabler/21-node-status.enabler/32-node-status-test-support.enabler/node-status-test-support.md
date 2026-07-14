# Node Status Test Support

PROVIDES a generated classification-tree fixture harness and readable node-status generator data for node-status evidence
SO THAT `spx/31-spec-domain.enabler/21-node-status.enabler`
CAN verify lifecycle classification, persisted status projections, and resolver delegation against real tracked spec-tree fixtures without hand-authored fixture paths

## Assertions

### Properties

- Generated classification-tree fixtures materialize tracked node specs and linked evidence from inert payloads, derive EXCLUDE membership from each generated node's facts, record test outcomes through the testing command, and resolve those recorded outcomes through the production node-outcome resolver ([test](tests/node-status-test-support.property.l1.test.ts))
- Generated delegation-tree fixtures contain one test-outcome-stage node, one declared node, and one specified node, so status-update delegation evidence always spans every consultation class ([test](tests/node-status-test-support.property.l1.test.ts))
- Generated node slugs come from the source-owned readable slug pool, so counterexamples avoid arbitrary punctuation and consecutive hyphens ([test](tests/node-status-test-support.property.l1.test.ts))

### Compliance

- ALWAYS: classification-tree fixtures write through the shared spec-tree test environment rather than ad hoc filesystem setup ([audit])
- ALWAYS: node-status fixture paths, evidence references, facts, and outcomes come from source-owned generators or source-owned node-status contracts ([audit])
- NEVER: node-status test support uses framework mocks or module interception for filesystem, spec-tree, node-status, or generator behavior ([audit])
