# Plan: Domain Execution Descriptors

## Purpose

Register testing, audit, and review execution descriptors on top of the shared config descriptor mechanism.

## Governing Specs

- `spx/16-config.enabler/config.md`
- `spx/16-config.enabler/21-descriptor-registration.adr.md`
- `spx/16-config.enabler/32-shared-config-primitives.enabler/shared-config-primitives.md`

## Implementation Notes

- Add descriptors in dependency order after shared primitives exist.
- Validate descriptor behavior against the consumer specs in `spx/41-testing.enabler/32-testing-config.enabler/testing-config.md`, `spx/36-audit.enabler/43-audit-config.enabler/audit-config.md`, and `spx/46-reviewing.enabler/21-review-config.enabler/review-config.md`.
- Testing descriptor owns passing-scope policy only.
- Audit descriptor owns storage defaults, branch slug settings, auditor selection, target filters, and base ref.
- Review descriptor owns local hermetic review defaults for branch and PR targets.
- Keep descriptor placement aligned with the companion-module rule in `spx/16-config.enabler/21-descriptor-registration.adr.md`.

## Evidence Required

- Registry-extension tests prove descriptors compose without changing existing descriptor modules.
- Config-format mapping tests cover JSON, YAML, and TOML sections for testing, audit, and review.
- Descriptor isolation tests prove malformed sections cannot affect other descriptors.
- Validation confirms descriptor modules do not duplicate shared primitive validators.
- Decide and evidence the domain-descriptor unknown-key policy across testing, audit, and review descriptors. The testing descriptor currently follows the validation descriptor's lenient section parsing, while the shared path-filter primitive already evidences that unknown filter keys are ignored.

## Parallelization

Testing, audit, and review descriptor implementation can split after the shared primitive API is merged.
