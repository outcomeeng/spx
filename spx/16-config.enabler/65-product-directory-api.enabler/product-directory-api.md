# Product Directory API

PROVIDES product-root vocabulary for config APIs and tests
SO THAT config consumers, harnesses, and execution descriptors
CAN refer to the repository root as `productDir`

## Assertions

### Compliance

- ALWAYS: config APIs, test harnesses, and descriptor tests name the repository root `productDir` ([review])
- ALWAYS: root-directory APIs expose `productDir` rather than `projectRoot` or `projectDir` ([review])
- ALWAYS: root-resolution helper names that use non-product vocabulary, such as `detectMainRepoRoot`, are renamed or have their Git plumbing scope documented in the owning module ([review])
- NEVER: add compatibility aliases for non-product root-directory names ([review])
