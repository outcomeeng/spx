# Methodology Source

The understand payload reads the Outcome Engineering foundation from one of spx's own shipped methodology trees — the trees governed by `spx/25-outcomeeng.enabler/31-methodology-plugin.enabler` — selected by two values known before the read: the methodology line, the `MAJOR.MINOR` of the version the top-level `methodology` config descriptor declares, and the coding agent in scope. Selection is a direct address into the shipped layout, `methodology/{MAJOR.MINOR}/{coding-agent}/spec-tree/`, resolved from spx's package root with no version comparison, range evaluation, directory search, or consumer-side path. The payload reads that tree's foundation-resource manifest, `skills/understand/manifest.json`, schema version 1; the manifest's core entry supplies the foundation body and its reference, template, and example catalogs supply the extended methodology catalog. The tree's `source.json` records the plugins-repository commit and plugin version its bytes were fetched from, a separate axis the reader never compares against the methodology version; where it records `provides` and `supports`, the reader checks the product's declaration against them per `spx/13-agent-capability-lifecycle.pdr.md`. While `methodology.migratingFrom` is declared, the declared version's tree serves both versions, and the payload reports the migration source alongside the declared version. An absent, unreadable, or unrecognized-schema-version manifest fails the whole projection naming the resolved manifest path. The core is the one manifest-named resource the projection reads, so only the core resolves through the tree containment boundary — through any symbolic link — before its bytes are embedded. Catalog entries project the manifest's declared identities as listed context: parse-time validation constrains each to a plugin-relative path, and no filesystem probe, existence check, or containment resolution participates in their inclusion, because a catalog entry binds no read obligation and carries no body — its resource is read, if ever, by the consumer that requests it.

## Rationale

The shipped tree makes the foundation a reviewed, versioned artifact of spx itself: the bytes a coding agent receives are the bytes in the spx release, identical on every host, in continuous integration, and offline, with no dependency on coding-agent-local plugin state, harness home directories, install order, or anything the consumer product commits. Resolving an installed plugin at run time makes the payload depend on state no product file records — a location outside the repository, a version chosen by whoever last installed, and a layout that differs per coding agent — so identical product revisions yield different foundations on different machines and that divergence never reaches review. Committing the tree into each consumer product is rejected for the same reason turned around: every consumer would carry a copy that drifts from the provider, and the payload would serve whatever copy the consumer last refreshed.

Keying the layout by methodology line puts the whole compatibility question at fetch time and leaves the reader with a lookup. Which plugin revision serves a methodology line is the provider's declaration, read once when the tree is fetched and recorded beside it; evaluating a range on every read would let a resolution change the foundation an agent receives without any spx file changing. The declared version's tree serves the migration source as well, on the provider's declaration that it supports that version, because a second tree for the source line would exist only where a plugins revision provides it.

Probing catalog resources on the filesystem is rejected: the product-tree listed roles are existence-filtered because they name tracked product documents, while catalog identities name resources of the methodology plugin — a different root — and dropping a manifest-declared identity on a failed probe would silently hide plugin breakage the manifest itself declares. A missing or link-diverted catalog resource therefore stays visible in the projection and surfaces exactly when a consumer requests it.

Version declaration is configuration-driven through the `methodology` descriptor because typed product configuration is how the harness manages methodology identity, and because the config capability sits below the spec domain in dependency order. No fallback source exists: a fallback would hide a missing line behind stale methodology, which is worse than an exact failure. Per `spx/14-cli-composition.adr.md`, manifest parsing, schema validation, `source.json` parsing, and catalog mapping are pure functions over supplied bytes, and the tree read enters the command handler through an injected reader rooted at an injected tree root, so the payload verifies over temp-directory fixtures shaped like the shipped layout.

## Invariants

- Identical shipped trees and identical configuration produce byte-identical methodology entries.
- Every methodology read entry's body equals the exact bytes of the manifest-named resource.
- Tree selection is a function of the declared methodology line and the coding agent in scope alone; no other input changes which tree is read.
- No fallback source exists: when the selected tree yields no valid manifest, the projection fails rather than substituting.
- Catalog entries equal the manifest's declared reference, template, and example identities in manifest order; no filesystem state adds, removes, or reorders them.

## Verification

### Testing

- ALWAYS: foundation bodies and the extended methodology catalog come from spx's shipped methodology tree addressed by the declared methodology line and the coding agent in scope, resolved from spx's package root ([compliance])
- ALWAYS: tree selection reads the declared methodology version's line and the coding agent in scope and performs no version comparison, range evaluation, directory search, or consumer-path resolution ([compliance])
- ALWAYS: manifest consumption validates the manifest's schema version and fails on an unrecognized version, naming the resolved manifest path ([compliance])
- NEVER: methodology resource resolution reaches the network, reads a coding agent's plugin cache or installed plugin, reads a consumer-side copy, or reads outside the selected shipped tree ([compliance])
- NEVER: the reader compares the declared methodology version against the recorded plugin version, or derives one from the other ([compliance])

### Audit

- ALWAYS: manifest parsing, schema validation, `source.json` parsing, and catalog mapping are pure functions over supplied bytes, and the tree read enters through an injected reader rooted at an injected tree root ([audit])
- ALWAYS: methodology-catalog listed entries are projections of parsed manifest data only — no filesystem probe, existence check, or containment resolution participates in their inclusion ([audit])
