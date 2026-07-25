# Methodology Source

The understand payload reads the Outcome Engineering foundation from the committed methodology package tree for the coding agent in scope — the per-agent trees governed by `spx/25-outcomeeng.enabler/31-methodology-package.enabler` — through that tree's foundation-resource manifest, `skills/understand/manifest.json`, schema version 1. The manifest's core entries supply the foundation bodies; its reference, template, and example catalogs supply the extended methodology catalog. The top-level `methodology` config descriptor supplies the exact version the selected tree's provenance record declares, and a divergence between them fails the projection. An absent, unreadable, or unrecognized-schema-version manifest fails the whole projection naming the resolved manifest path. The core is the one manifest-named resource the projection reads, so only the core resolves through the package-tree containment boundary — through any symbolic link — before its bytes are embedded. Catalog entries project the manifest's declared identities as listed context: parse-time validation constrains each to a package-relative path, and no filesystem probe, existence check, or containment resolution participates in their inclusion, because a catalog entry binds no read obligation and carries no body — its resource is read, if ever, by the consumer that requests it.

## Rationale

The committed package tree is the product's own declaration of the methodology it runs, so reading it makes the foundation a reviewed, versioned product artifact: the bytes an agent receives are the bytes in the changeset, identical on every host, in continuous integration, and offline, with no dependency on agent-local plugin state, harness home directories, or install order. Resolving an installed package at run time makes the payload depend on state no product file records — a location outside the repository, a version chosen by whoever last installed, and a layout that differs per coding agent — so identical product revisions yield different foundations on different machines and that divergence never reaches review.

Currency is a validation obligation rather than a resolution strategy. Each tree's provenance record names the exact methodology version and content digest it materialized from, and validation compares that record against the tree's current content and against the installed package when one is present, so a tree that falls behind fails a gate instead of serving stale methodology unnoticed. Under `spx/13-agent-capability-lifecycle.pdr.md`, exact committed capability versions are the product's declaration and no coding agent's capability artifacts are translated into another agent's native format; the payload therefore selects the tree matching the agent in scope and never composes one tree's foundation from another's.

Probing catalog resources on the filesystem is rejected: the product-tree listed roles are existence-filtered because they name tracked product documents, while catalog identities name resources of the methodology package — a different root — and dropping a manifest-declared identity on a failed probe would silently hide package breakage the manifest itself declares. A missing or link-diverted catalog resource therefore stays visible in the projection and surfaces exactly when a consumer requests it.

Version resolution is configuration-driven through the `methodology` descriptor because typed product configuration is how the harness manages methodology identity, and because the config capability sits below the spec domain in dependency order. No fallback source exists: a fallback would hide a broken materialization behind stale methodology, which is worse than an exact failure. Per `spx/14-cli-composition.adr.md`, manifest parsing, schema validation, provenance comparison, and catalog mapping are pure functions over supplied bytes, and the package-tree read enters the command handler through an injected reader, so the payload verifies over temp-directory fixtures without a materialized tree.

## Invariants

- Identical committed package trees and identical configuration produce byte-identical methodology entries.
- Every methodology read entry's body equals the exact bytes of the manifest-named resource.
- The selected tree's provenance record declares the exact methodology version the `methodology` descriptor resolves.
- No fallback source exists: when the selected tree yields no valid manifest, the projection fails rather than substituting.
- Catalog entries equal the manifest's declared reference, template, and example identities in manifest order; no filesystem state adds, removes, or reorders them.

## Verification

- ALWAYS: foundation bodies and the extended methodology catalog come from the committed methodology package tree selected for the coding agent in scope, governed by `spx/25-outcomeeng.enabler/31-methodology-package.enabler`.
- ALWAYS: manifest consumption validates the manifest's schema version and fails on an unrecognized version, naming the resolved manifest path.
- ALWAYS: the projection fails when the selected tree's provenance record declares a methodology version other than the one the top-level `methodology` config descriptor resolves.
- ALWAYS: manifest parsing, schema validation, provenance comparison, and catalog mapping are pure functions over supplied bytes, and the committed-tree read enters through an injected reader.
- NEVER: methodology resource resolution reaches the network, reads an agent-local installed package, or reads outside the selected committed package tree.

### Audit

- ALWAYS: methodology-catalog listed entries are projections of parsed manifest data only — no filesystem probe, existence check, or containment resolution participates in their inclusion ([audit])
