# Plan: 26-release.enabler

Product decisions: `spx/26-release.enabler/15-release-model.pdr.md`. Architecture: `spx/26-release.enabler/18-release-architecture.adr.md`.

## Apply order

Apply children in dependency order: `spx/26-release.enabler/21-release-data.enabler` (the deterministic provider the other children consume) first, then `spx/26-release.enabler/32-release-notes.enabler` and `spx/26-release.enabler/32-documentation-sync.enabler`, then `spx/26-release.enabler/43-publish-dispatch.enabler`.
