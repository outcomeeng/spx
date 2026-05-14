# Canonical Descriptor Digest

PROVIDES deterministic descriptor-section serialization and digest computation
SO THAT testing, auditing, reviewing, and persisted execution state
CAN detect stale observations without depending on raw config file formatting

## Assertions

### Compliance

- ALWAYS: descriptor digests are computed from resolved descriptor sections after defaults are applied ([review])
- ALWAYS: config exports a stable canonical descriptor JSON function and SHA-256 digest function for resolved descriptor sections ([review])
- ALWAYS: canonical descriptor JSON sorts object keys recursively, preserves array order, and emits no insignificant whitespace ([review])
- ALWAYS: digest bytes are UTF-8 bytes of canonical descriptor JSON and SHA-256 is provided by `node:crypto` ([review])
- NEVER: include unrelated descriptor sections or raw config formatting in a descriptor digest ([review])
