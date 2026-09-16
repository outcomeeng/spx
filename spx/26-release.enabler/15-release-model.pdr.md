# Release Model

spx offers release as a capability applied to any product it runs against: it derives each release's contents from that product's git history — the package version, the commits since the last release tag, the version delta, and the changed paths — and turns them into Keep a Changelog release notes, updates to a configured documentation set, and a governed, provenance-bearing publication. When a product carries a spec tree, every specification that governs or is affected by a changed implementation path informs those generated artifacts; shared, deleted, and reassigned paths retain all applicable context from both release endpoints, and a path with no applicable specification at either endpoint is reported before generation. Products without a spec tree remain supported.

## Rationale

A release describes the changes a product ships, so deriving it from git history keeps it accurate and reproducible without coupling it to validation, testing, or agentic verification; running those gates before a release is the product exercising its own commands, not a release dependency.

## Product properties

1. A release's contents derive from the product's git history, including changes to decisions, specifications, and implementation; commit types never determine whether a change has a user-visible effect, and every changed implementation path contributes applicable product context or a pre-generation unresolved-path diagnostic. Identical repository state yields identical release data.
2. Release notes, documentation updates, and publication agree on the released version and the changes it contains.
3. Release data can be computed deterministically and offline without model credentials.

## Verification

### Testing

- ALWAYS: release data is the package version, the commits since the previous release tag, the version delta, and the changed paths, computed from the product's git history ([conformance])
- ALWAYS: release-data computation is deterministic — identical repository state yields identical release data ([property])
- ALWAYS: release notes conform to the Keep a Changelog structure ([conformance])
- ALWAYS: publication proceeds only when the release tag equals the package version prefixed with `v` ([compliance])
- NEVER: computing release data performs network access or invokes a model — git plumbing and the local working tree are its only inputs ([compliance])

### Audit

- ALWAYS: generated release notes and documentation updates account for the product specification, governing decisions, and every affected specification that applies to the released changes when present; evidence and implementation establish what the release delivers, and a declaration alone never establishes implemented behavior ([audit])
- ALWAYS: generated release notes and documentation updates stay faithful to the release's changes; each producer and its independent faithfulness auditor judge against identical product context, release inputs, and shared standards ([audit])
- ALWAYS: publication carries build provenance through the registry's trusted-publishing mechanism ([audit])
- NEVER: a release is gated on an in-tree domain — running validation, testing, or agentic verification before a release is the product exercising its own commands, not a release dependency ([audit])
