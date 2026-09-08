---
malleability: spec
---

# Methodology Plugin

PROVIDES the Outcome Engineering foundation as spx's own shipped methodology trees — one coding-agent-native `spec-tree` plugin tree per methodology line spx ships and per coding agent the plugins repository builds, fetched from `outcomeeng/plugins` at a recorded revision and committed under `methodology/{MAJOR.MINOR}/{coding-agent}/spec-tree/` in the spx package
SO THAT context ingestion, diagnose, and compact recovery
CAN serve the foundation for the methodology version a product declares from spx's package root, offline, without an installed plugin, a coding-agent plugin cache, or a consumer-side copy

## Assertions

- A shipped tree is addressed by methodology line — the `MAJOR.MINOR` of a declared methodology version — then coding agent, then plugin name, resolved from spx's package root; a consumer product commits no tree, and no consumer path participates in resolution
- Each `methodology/{MAJOR.MINOR}/{coding-agent}/spec-tree/` holds the `skills/understand/` directory of that coding agent's built plugin exactly as the plugins repository publishes it at the fetched revision, so every path the foundation-resource manifest names resolves unchanged
- Each `methodology/{MAJOR.MINOR}/` carries one `source.json` naming the source repository, the resolved commit the bytes were fetched from, and, per coding agent, the plugin name and version read from that agent's `plugin.json` at that revision together with its `methodology.provides` and `methodology.supports` values when the manifest declares them
- The fetch, `pnpm run methodology:fetch`, reads `outcomeeng/plugins` at a named revision — a branch, tag, or commit — through a sparse, blobless clone limited to `dist/{coding-agent}/spec-tree/`, resolves the revision to one commit, replaces the whole `methodology/{MAJOR.MINOR}/` directory it targets, and writes nothing else
- The fetch takes the methodology line from `methodology.provides` in the fetched `plugin.json` when that block exists, requires an explicit `--line <MAJOR.MINOR>` argument when it does not, and fails when the coding agents' manifests disagree on the line
- The fetch is deterministic: the same revision and line produce byte-identical trees and `source.json`
- A repository dispatch from the plugins repository's push to its default branch, and a manual dispatch, run the fetch in spx's continuous integration and open a pull request carrying the refreshed tree through the normal gate
- NEVER: the fetch, the reader, or any consumer reads a coding agent's plugin cache, installed plugin, marketplace clone, or user-scope directory to resolve, verify, or enumerate methodology resources
- NEVER: a tree is derived from another coding agent's tree, per `spx/13-agent-capability-lifecycle.pdr.md`
- NEVER: a directory under `methodology/` carries a patch version in its name
