# Shared Config Primitives

PROVIDES reusable config value primitives for descriptor-owned sections
SO THAT validation, testing, auditing, reviewing, and additional execution domains
CAN share structural validation without sharing domain policy

## Assertions

### Scenarios

- Given validation declares a path filter in a real product config file, when config resolves through the production registry, then validation exposes the structurally validated filter under its own section ([test](tests/path-filter-config.scenario.l1.test.ts))

### Properties

- Path filter validation preserves generated include/exclude string arrays and omitted fields for every valid generated filter ([test](tests/path-filter.property.l1.test.ts))
- Path filter application keeps exactly the paths admitted by the include set and not matched by the exclude set, matching a prefix by path-segment boundary ([test](tests/path-filter-apply.property.l1.test.ts))

### Compliance

- ALWAYS: shared primitives validate reusable structure only; importing descriptors own defaults, section placement, and product meaning ([review])
- ALWAYS: path include/exclude filters are declared once and imported by every descriptor that exposes path-scope configuration ([test](tests/path-filter.compliance.l1.test.ts), [review])
- ALWAYS: path filter validation rejects non-object filters and non-string include/exclude fields with descriptor path-qualified errors ([test](tests/path-filter.compliance.l1.test.ts))
- ALWAYS: path filter validation ignores unknown keys so future descriptors can add policy-owned fields without changing the shared primitive output ([test](tests/path-filter.compliance.l1.test.ts))
- NEVER: put validation, testing, auditing, or reviewing policy defaults inside a shared primitive ([review])
