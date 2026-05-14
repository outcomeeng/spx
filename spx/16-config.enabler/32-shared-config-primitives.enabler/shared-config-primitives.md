# Shared Config Primitives

PROVIDES reusable config value primitives for descriptor-owned sections
SO THAT validation, testing, auditing, reviewing, and additional execution domains
CAN share structural validation without sharing domain policy

## Assertions

### Compliance

- ALWAYS: shared primitives validate reusable structure only; importing descriptors own defaults, section placement, and product meaning ([review])
- ALWAYS: path include/exclude filters are declared once and imported by every descriptor that exposes path-scope configuration ([review])
- NEVER: put validation, testing, auditing, or reviewing policy defaults inside a shared primitive ([review])
