# Config Test Generators

PROVIDES source-owned generated config fixtures, descriptor fixtures, config-section variants, and product-directory fixture values
SO THAT config, file-inclusion, testing, agent-environment, spec-domain, and test-environment assertions
CAN exercise registered descriptor resolution, invalid descriptor sections, path-filter variants, spec-tree kind overrides, agent-environment config, and product-directory config behavior without hand-written config literals or production registry coupling

## Assertions

### Properties

- Generated spec-tree config fixtures always include at least one node kind and at least one decision kind, and generated kind overrides use source-owned kind categories ([test](tests/config-test-generators.property.l1.test.ts))
- Generated path-filter, testing config, and agent-environment config fixtures validate through their owning descriptors or shared primitives while preserving generated expected values ([test](tests/config-test-generators.property.l1.test.ts))

### Compliance

- NEVER: generated descriptor validators read another descriptor's parsed section or raw config-file content ([test](tests/config-test-generators.compliance.l1.test.ts))
