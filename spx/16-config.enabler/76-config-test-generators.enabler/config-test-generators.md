---
id: 01a0ebc4-fb67-7421-90c8-763178d4b88a
malleability: spec
---

# Config Test Generators

PROVIDES source-owned generated config fixtures, descriptor fixtures, config-section variants, and product-directory fixture values
SO THAT config, file-inclusion, testing, agent-environment, spec-domain, and test-environment assertions
CAN exercise registered descriptor resolution, invalid descriptor sections, path-filter variants, the rejected spec-tree `kinds` field, agent-environment config, and product-directory config behavior without hand-written config literals or production registry coupling

## Assertions

### Properties

- Generated spec-tree config fixtures carry no `kinds` field, and generated rejected spec-tree sections carry a `kinds` field either as a list of source-owned kind names or as a map of source-owned kind definitions ([test](tests/config-test-generators.property.l1.test.ts))
- Generated test-scoped descriptor fixtures supply the sample sections that config resolution composes, defaults, validates, and rejects, and each generated section validates through its generated descriptor while preserving its generated expected value ([test](tests/config-test-generators.property.l1.test.ts))
- Generated path-filter, testing config, and agent-environment config fixtures validate through their owning descriptors or shared primitives while preserving generated expected values ([test](tests/config-test-generators.property.l1.test.ts))

### Compliance

- NEVER: generated descriptor validators read another descriptor's parsed section or raw config-file content ([test](tests/config-test-generators.compliance.l1.test.ts))
