---
tier: prototype
---

# Methodology Source

The understand payload reads the Outcome Engineering foundation from one committed methodology plugin tree — the trees governed by `spx/25-outcomeeng.enabler/31-methodology-plugin.enabler` — selected by two values known before the read: the methodology version the top-level `methodology` config descriptor declares, and the coding agent in scope. Selection is a direct address into the committed layout, `methodology/{methodology-version}/{coding-agent}/{plugin}/`, with no version comparison, range evaluation, or search. The payload reads that tree's foundation-resource manifest, `skills/understand/manifest.json`, schema version 1; the manifest's core entries supply the foundation bodies and its reference, template, and example catalogs supply the extended methodology catalog. The selected tree's provenance record declares the plugin and exact plugin version its bytes materialized from, a separate axis the reader never compares against the methodology version. While `methodology.migratingFrom` is declared, the tree for the migration source is addressable by the same rule, so a consumer reading an artifact written against that version reaches its foundation. An absent, unreadable, or unrecognized-schema-version manifest fails the whole projection naming the resolved manifest path. The core is the one manifest-named resource the projection reads, so only the core resolves through the plugin-tree containment boundary — through any symbolic link — before its bytes are embedded. Catalog entries project the manifest's declared identities as listed context: parse-time validation constrains each to a plugin-relative path, and no filesystem probe, existence check, or containment resolution participates in their inclusion, because a catalog entry binds no read obligation and carries no body — its resource is read, if ever, by the consumer that requests it.

## Rationale

The committed plugin tree is the product's own declaration of the methodology it runs, so reading it makes the foundation a reviewed, versioned product artifact: the bytes a coding agent receives are the bytes in the changeset, identical on every host, in continuous integration, and offline, with no dependency on coding-agent-local plugin state, harness home directories, or install order. Resolving an installed plugin at run time makes the payload depend on state no product file records — a location outside the repository, a version chosen by whoever last installed, and a layout that differs per coding agent — so identical product revisions yield different foundations on different machines and that divergence never reaches review.

Currency is a validation obligation rather than a resolution strategy. Each tree's provenance record names the methodology version it serves, the plugin and exact plugin version it materialized from, and the content digest of its bytes, and validation compares that record against the tree's current content, so a tree edited in place fails a gate instead of serving altered methodology unnoticed. Comparing the record against a coding agent's installed plugin is rejected: that read depends on install order and on a per-coding-agent cache layout the product does not govern, which is the run-time dependency this decision removes. Under `spx/13-agent-capability-lifecycle.pdr.md`, exact committed capability versions are the product's declaration and no coding agent's capability artifacts are translated into another coding agent's native format; the payload therefore selects the tree matching the coding agent in scope and never composes one tree's foundation from another's.

Keying the layout by methodology version puts the whole compatibility question at materialization time and leaves the reader with a lookup. Which plugin version serves a methodology version is a range relation over two independent numbering schemes; evaluating it on every read would make the payload depend on a declaration published artifacts do not yet carry, and would let a resolution change the foundation an agent receives without any product file changing. Addressing the tree by the version the product declares makes the answer a committed fact instead, and makes a methodology migration an atomic subtree operation: the target version's trees arrive, the source version's trees leave when no artifact needs them, and no intermediate state serves a foundation the configuration does not name.

Probing catalog resources on the filesystem is rejected: the product-tree listed roles are existence-filtered because they name tracked product documents, while catalog identities name resources of the methodology plugin — a different root — and dropping a manifest-declared identity on a failed probe would silently hide plugin breakage the manifest itself declares. A missing or link-diverted catalog resource therefore stays visible in the projection and surfaces exactly when a consumer requests it.

Version declaration is configuration-driven through the `methodology` descriptor because typed product configuration is how the harness manages methodology identity, and because the config capability sits below the spec domain in dependency order. No fallback source exists: a fallback would hide a broken materialization behind stale methodology, which is worse than an exact failure. Per `spx/14-cli-composition.adr.md`, manifest parsing, schema validation, provenance comparison, and catalog mapping are pure functions over supplied bytes, and the plugin-tree read enters the command handler through an injected reader, so the payload verifies over temp-directory fixtures without a materialized tree.

## Invariants

- Identical committed plugin trees and identical configuration produce byte-identical methodology entries.
- Every methodology read entry's body equals the exact bytes of the manifest-named resource.
- Tree selection is a function of the declared methodology version and the coding agent in scope alone; no other input changes which tree is read.
- The selected tree's provenance record declares the methodology version it serves, and the plugin and exact plugin version its bytes materialized from.
- No fallback source exists: when the selected tree yields no valid manifest, the projection fails rather than substituting.
- Catalog entries equal the manifest's declared reference, template, and example identities in manifest order; no filesystem state adds, removes, or reorders them.

## Verification

- ALWAYS: foundation bodies and the extended methodology catalog come from the committed methodology plugin tree addressed by the declared methodology version and the coding agent in scope, governed by `spx/25-outcomeeng.enabler/31-methodology-plugin.enabler`.
- ALWAYS: tree selection reads the declared methodology version and the coding agent in scope and performs no version comparison, range evaluation, or directory search.
- ALWAYS: manifest consumption validates the manifest's schema version and fails on an unrecognized version, naming the resolved manifest path.
- ALWAYS: the projection fails when the selected tree's recorded content digest disagrees with that tree's current content.
- ALWAYS: manifest parsing, schema validation, provenance comparison, and catalog mapping are pure functions over supplied bytes, and the committed-tree read enters through an injected reader.
- NEVER: methodology resource resolution reaches the network, reads a coding agent's plugin cache or installed plugin, or reads outside the selected committed plugin tree.
- NEVER: the reader compares the declared methodology version against the provenance record's plugin version, or derives one from the other.

### Audit

- ALWAYS: methodology-catalog listed entries are projections of parsed manifest data only — no filesystem probe, existence check, or containment resolution participates in their inclusion ([audit])
