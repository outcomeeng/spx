# Release Model

spx offers release as a capability applied to any product it runs against: it derives each release's contents from that product's git history — the commits since the last release tag, the version delta, and the changed paths — and turns them into Keep a Changelog release notes, updates to a configured documentation set, and a governed, provenance-bearing publication. A release depends on no in-tree domain.

## Rationale

A release describes the changes a product ships, so deriving it from git history keeps it accurate and reproducible without coupling it to validation, testing, auditing, or reviewing; running those gates before a release is the product exercising its own commands, not a release dependency.

## Product properties

1. A release's contents derive solely from the product's git history, so identical repository state always yields identical release data.
2. Release notes, documentation updates, and publication all read from one shared release-data description, so they agree on what the release contains.
3. Computing release data is deterministic and offline; generating release notes and documentation updates is the only part that consults a model.

## Verification

### Testing

- ALWAYS: release data is the commits since the previous release tag, the version delta, and the changed paths, computed from the product's git history ([scenario])
- ALWAYS: release-data computation is deterministic — identical repository state yields identical release data ([property])
- ALWAYS: release notes conform to the Keep a Changelog structure ([conformance])
- ALWAYS: publication proceeds only when the release tag equals the package version prefixed with `v` ([scenario])
- NEVER: computing release data performs network access or invokes a model — git plumbing and the local working tree are its only inputs ([compliance])

### Audit

- ALWAYS: generated release notes and documentation updates stay faithful to the underlying commits and introduce no claim absent from the release's changes ([audit])
- ALWAYS: publication carries build provenance through the registry's trusted-publishing mechanism ([audit])
- NEVER: a release is gated on an in-tree domain — running validation, testing, auditing, or reviewing before a release is the product exercising its own commands, not a release dependency ([audit])
