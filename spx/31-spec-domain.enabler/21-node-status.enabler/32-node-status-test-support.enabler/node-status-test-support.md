# Node Status Test Support

PROVIDES a generated classification-tree fixture harness and readable node-status generator data for node-status evidence
SO THAT `spx/31-spec-domain.enabler/21-node-status.enabler`
CAN verify lifecycle classification, persisted status projections, and resolver delegation against real tracked spec-tree fixtures without hand-authored fixture paths

## Assertions

### Properties

- Generated classification-tree fixtures materialize tracked node specs and linked evidence from inert payloads, derive EXCLUDE membership from each generated node's facts, record test outcomes through the testing command, and resolve those recorded outcomes through the production node-outcome resolver ([test](tests/node-status-test-support.property.l1.test.ts))
- Generated delegation-tree fixtures contain one test-outcome-stage node, one declared node, and one specified node, so status-update delegation evidence always spans every consultation class ([test](tests/node-status-test-support.property.l1.test.ts))
- Generated status-writer-tree fixtures materialize node specs, linked evidence, `spx/EXCLUDE` membership, and committed test claims from each generated node's facts in a product directory outside any git repository, and the controlled node-outcome resolver reports each consulted reference's generated outcome and omits every reference the fixture marks covered but stale ([test](tests/node-status-test-support.property.l1.test.ts))

### Compliance

- ALWAYS: classification-tree fixtures write through the shared spec-tree test environment rather than ad hoc filesystem setup ([audit])
- ALWAYS: node-status fixture paths and variable input domains come from generators, while evidence grammar, facts, and outcomes come from source-owned node-status contracts ([audit])
- NEVER: node-status test support uses framework mocks or module interception for filesystem, spec-tree, node-status, or generator behavior ([audit])

### Test.Property: source-grammar fixtures

- source-grammar-node-fixtures: For every generated source-grammar node, under a declaration of 4.0 migrating from 3.2, the fixture materializes the node's spec with the audit-tag form its facts name, one of none, an `audit` link to `audits/{rule-slug}.md`, a pathless review tag, and a pathless audit tag, and with the Malleability its facts name, one of `spec`, `verification`, `implementation`, and none declared
- source-grammar-node-repositories: For every generated source-grammar node repository, under a declaration of 4.0 migrating from 3.2 or of 4.0 with no migration source, the repository commits a node spec carrying the node's audit-tag form, its declared Malleability or none, and a link to a passing test, together with that test and its subject, and its resolvers answer every test, audit slug, and evidence kind the node requires as passed
- tracking-scope: For every generated classification tree, tracking it through `trackSpecTree` and through `commitProjection` alike adds to the git index every node spec, linked evidence file, and `spx/EXCLUDE` file the fixture's nodes declare, and no file outside the product's `spx/` tree
- [readable-slugs](tests/node-status-test-support.property.l1.test.ts): For every node slug and audit slug a node-status generator produces, in classification, delegation, status-writer, and source-grammar trees and in source-grammar node repositories, the slug comes from the generator-owned readable slug domain, so counterexamples avoid arbitrary punctuation and consecutive hyphens
