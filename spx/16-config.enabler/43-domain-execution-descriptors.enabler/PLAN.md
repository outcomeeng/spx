# Plan: Domain Execution Descriptors

## Purpose

Register the testing execution descriptor on top of the shared config descriptor mechanism. The audit and review descriptors this node once also registered collapsed into the journal channel at `spx/60-surfaces.enabler/21-cli-surface.enabler/21-journal.enabler/` and were removed.

## Governing Specs

- `spx/16-config.enabler/config.md`
- `spx/16-config.enabler/21-descriptor-registration.adr.md`
- `spx/16-config.enabler/32-shared-config-primitives.enabler/shared-config-primitives.md`

## Implementation Notes

- Add descriptors in dependency order after shared primitives exist.
- Validate descriptor behavior against the consumer spec in `spx/41-test.enabler/32-test-config.enabler/test-config.md`; the audit and review consumer specs are gone with those domains' collapse into the journal channel.
- Testing descriptor owns passing-scope policy only.
- Keep descriptor placement aligned with the companion-module rule in `spx/16-config.enabler/21-descriptor-registration.adr.md`.

## Evidence Required

- Registry-extension tests prove descriptors compose without changing existing descriptor modules.
- Config-format mapping tests cover JSON, YAML, and TOML sections for the testing descriptor.
- Descriptor isolation tests prove malformed sections cannot affect other descriptors.
- Validation confirms descriptor modules do not duplicate shared primitive validators.
- Domain execution descriptor validators ignore unknown section keys by design: each descriptor reads declared fields and discards the rest.

## Parallelization

The testing descriptor is the sole remaining domain execution descriptor; the audit and review descriptors collapsed into the journal channel and were removed, so no cross-descriptor split remains.
