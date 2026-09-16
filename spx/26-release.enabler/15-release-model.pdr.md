# Release Model

spx offers release as a capability applied to any product it runs against: it derives each release's contents from that product's git history — the package version, the commits since the last release tag, the version delta, and the changed paths — and turns them into Keep a Changelog release notes, updates to a configured documentation set, and a governed, provenance-bearing publication. A changed path is an implementation path when a registered evidence-reachability provider classifies it as source at either release-range endpoint; its ownership resolves from evidence reachability and exact audit-declaration path references, several candidate owners establish their lowest common ancestor as the governing owner while retaining every candidate as affected context, and endpoint union preserves context for shared, deleted, and re-owned paths. Products without a spec tree remain supported, while a product with a spec tree reports every implementation path that remains unresolved before generation begins.

## Rationale

A release describes the changes a product ships, so deriving it from git history keeps it accurate and reproducible without coupling it to validation, testing, or agentic verification; running those gates before a release is the product exercising its own commands, not a release dependency.

## Product properties

1. A release's contents derive from the product's git history, including changes to decisions, specifications, and implementation; commit types never determine whether a change has a user-visible effect, and every changed implementation path contributes governing-node context or a pre-generation unresolved-path diagnostic. Identical repository state yields identical release data and governing-node selection.
2. Release notes, documentation updates, and publication agree on the released version and the changes it contains.
3. Release data can be computed deterministically and offline without model credentials.

## Verification

- ALWAYS: every changed path classified as source by a registered evidence-reachability provider at either release-range endpoint resolves against both endpoint trees from evidence reachability and exact audit-declaration path references; each endpoint returns the deduplicated candidate owners and their lowest common ancestor as governing owner, or unresolved when no candidate exists; every distinct candidate and governing owner contributes context, shared or multiply claimed paths retain every candidate, a deleted path remains resolvable from the earlier endpoint, and a path unresolved at both endpoints is reported before either agent runs

### Testing

- ALWAYS: release data is the package version, the commits since the previous release tag, the version delta, and the changed paths, computed from the product's git history ([conformance])
- ALWAYS: release-data computation is deterministic — identical repository state yields identical release data ([property])
- ALWAYS: release notes conform to the Keep a Changelog structure ([conformance])
- ALWAYS: publication proceeds only when the release tag equals the package version prefixed with `v` ([compliance])
- NEVER: computing release data performs network access or invokes a model — git plumbing and the local working tree are its only inputs ([compliance])

### Audit

- ALWAYS: generated release notes and documentation updates interpret changes through the product specification, governing decisions, and affected specifications selected from direct spec-tree changes and deterministic implementation ownership, in that order, when present; evidence and implementation establish what the release delivers, and a declaration alone never establishes implemented behavior ([audit])
- ALWAYS: generated release notes and documentation updates stay faithful to the release's changes; each producer and its independent faithfulness auditor judge against identical product context, release inputs, and shared standards ([audit])
- ALWAYS: publication carries build provenance through the registry's trusted-publishing mechanism ([audit])
- NEVER: a release is gated on an in-tree domain — running validation, testing, or agentic verification before a release is the product exercising its own commands, not a release dependency ([audit])
