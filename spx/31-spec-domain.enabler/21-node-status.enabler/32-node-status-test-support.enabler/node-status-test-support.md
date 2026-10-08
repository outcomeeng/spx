# Node Status Test Support

PROVIDES a generated classification-tree fixture harness and readable node-status generator data for node-status evidence
SO THAT `spx/31-spec-domain.enabler/21-node-status.enabler`
CAN verify lifecycle classification, persisted status projections, and resolver delegation against real tracked spec-tree fixtures without hand-authored fixture paths

## Assertions

### Properties

- Generated classification-tree fixtures materialize tracked node specs and linked evidence from inert payloads, derive EXCLUDE membership from each generated node's facts, record test outcomes through the testing command, and resolve those recorded outcomes through the production node-outcome resolver ([test](tests/node-status-test-support.property.l1.test.ts))
- Generated delegation-tree fixtures contain one test-outcome-stage node, one declared node, and one specified node, so status-update delegation evidence always spans every consultation class ([test](tests/node-status-test-support.property.l1.test.ts))
- Generated status-writer-tree fixtures materialize git-tracked node specs, linked evidence, `spx/EXCLUDE` membership, and committed test claims from each generated node's facts, and the controlled node-outcome resolver reports each consulted reference's generated outcome while omitting every reference the fixture marks covered but stale ([test](tests/node-status-test-support.property.l1.test.ts))
- Generated node slugs come from the generator-owned readable slug domain, so counterexamples avoid arbitrary punctuation and consecutive hyphens ([test](tests/node-status-test-support.property.l1.test.ts))

### Compliance

- ALWAYS: classification-tree fixtures write through the shared spec-tree test environment rather than ad hoc filesystem setup ([audit])
- ALWAYS: node-status fixture paths and variable input domains come from generators, while evidence grammar, facts, and outcomes come from source-owned node-status contracts ([audit])
- NEVER: node-status test support uses framework mocks or module interception for filesystem, spec-tree, node-status, or generator behavior ([audit])
