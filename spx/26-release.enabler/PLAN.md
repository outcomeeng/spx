# Plan: 26-release.enabler

## Purpose

The release enabler makes the product releasable and thus valuable. It is a provider: it
sits ahead of every domain (index 26, before 31), and every domain follows it because a
capability's delivered value is realized only through release. It depends on no domain —
only the foundational git plumbing and CLI substrate (indices <= 23). Running the product's
own validation and test gates before a release is self-application, excluded from the
dependency graph.

## Structure

- `spx/26-release.enabler/21-release-data.enabler` — deterministic git release data
  (commits since last tag, version delta, changed paths); the testable, no-install core;
  provider to the other children.
- `spx/26-release.enabler/32-release-notes.enabler` — agent-authored release notes from
  release data.
- `spx/26-release.enabler/32-documentation-sync.enabler` — agent-driven documentation
  updates from release data; independent of release-notes (same index).
- `spx/26-release.enabler/43-publish-dispatch.enabler` — governed publish with provenance
  and tag-version verification; follows the 32 children.

New git utilities (tag listing, commits-since-tag, changed paths) are single-consumer and
live inside `spx/26-release.enabler/21-release-data.enabler`.

## Open refinements (resolve in the release PDR/ADR during authoring)

- publish-dispatch framing: an offered capability vs governance of the product's own
  `publish.yml` (self-application). If self-application only, the node governs the publish
  workflow without an offered-command surface.
- release-notes format and grouping (e.g. Conventional Commits) and versioning scheme.
- documentation-sync scope: which documentation files a release update covers.
- The agent-invocation mechanism for the `32-*` children is an architecture decision for
  `/typescript:architecting-typescript`; it is not a dependency on the agent-environment
  domain.

## Index horizon

The child range is composed at 21 / 32 / 32 / 43. Remaining integer space is reserved for
future release concerns.
