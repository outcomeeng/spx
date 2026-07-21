# Methodology Source

The understand payload reads the Outcome Engineering foundation from the foundation-resource manifest of the installed methodology package — `skills/understand/manifest.json`, schema version 1 — whose identity and installed location resolve from the top-level `methodology` config descriptor. The manifest's core entries supply the foundation bodies; its reference, template, and example catalogs supply the extended methodology catalog. spx embeds no foundation snapshot, and an absent, unreadable, or unrecognized-schema-version manifest fails the whole projection naming the resolved manifest path.

## Rationale

The methodology repository is the sole foundation authority. A snapshot baked into the executable at build time is a second copy whose currency depends on an spx release: every foundation advance would require a vendor-sync commit and a publish before agents see it, recreating the copy-drift problem the published manifest exists to close. Reading the installed package keeps foundation updates flowing with the methodology package itself, stays offline — the read is a local file — and stays deterministic for identical installed resources. The manifest contract is versioned and enforced in the methodology repository, so consumption validates the manifest's schema version and rejects an unrecognized version rather than guessing at shape; additive evolution within a schema version is accepted without change here.

Location resolution is configuration-driven through the `methodology` descriptor because typed product configuration is how the harness manages methodology context source and version, and because the config capability sits below the spec domain in dependency order while harness-environment state does not — a resolver coupled to agent-environment configuration would invert the ordering between `spx/31-spec-domain.enabler` and `spx/33-harness-environment.enabler`. No fallback source exists: a fallback would hide a broken installation behind stale methodology, which is worse than an exact failure. Per `spx/14-cli-composition.adr.md`, manifest parsing, schema validation, and catalog mapping are pure functions over supplied bytes, and the installed-package read enters the command handler through an injected reader, so the payload verifies over temp-directory fixtures without an installed plugin.

## Invariants

- Identical installed methodology resources and identical configuration produce byte-identical methodology entries.
- Every methodology read entry's body equals the exact bytes of the manifest-named resource.
- No fallback source exists: when the configured location does not yield a valid manifest, the projection fails rather than substituting.

## Verification

- ALWAYS: foundation bodies and the extended methodology catalog come from the foundation-resource manifest of the installed methodology package resolved from the top-level `methodology` config descriptor
- ALWAYS: manifest consumption validates the manifest's schema version and fails on an unrecognized version, naming the resolved manifest path
- ALWAYS: manifest parsing, schema validation, and catalog mapping are pure functions over supplied bytes, and the installed-package read enters through an injected reader
- NEVER: a foundation snapshot is embedded in the executable or this repository as a source or fallback for the understand payload
- NEVER: methodology resource resolution reaches the network or reads outside the configured installed package location
