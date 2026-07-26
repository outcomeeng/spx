# Methodology Plugin

PROVIDES the Outcome Engineering methodology as committed plugin trees — one coding-agent-native tree per coding agent the marketplace builds, each carrying a provenance record naming the plugin, its exact version, and the content digest of the tree it describes
SO THAT context ingestion, capability reconciliation, and methodology identity inspection
CAN read, reproduce, and compare the methodology the product declares without resolving an installed plugin at run time, reaching the network, or traversing coding-agent-local plugin state

## Assertions

- Every coding agent the marketplace builds has its own committed plugin tree, and no tree is derived from another coding agent's tree.
- Committed plugin trees are addressed by coding agent and then by plugin name, under a product directory outside the tracked `spx/` tree, so materialized content never enters spec-tree traversal or markdown validation.
- Each committed plugin tree carries a provenance record naming the plugin, the exact plugin version it materialized from, and the content digest of the tree it describes.
- Materialization is deterministic: an identical marketplace source and plugin version produce byte-identical committed trees and provenance records.
- Provenance validation compares each committed tree's recorded digest against that tree's current content, and against the installed plugin when one is present, reporting divergence as a failure that names the diverging tree.
- ALWAYS: committed plugin trees and their provenance records are machine-written artifacts whose only writer is materialization.
- NEVER: materialization translates, merges, or normalizes one coding agent's native plugin artifacts into another coding agent's format, per `spx/13-agent-capability-lifecycle.pdr.md`.
- NEVER: reading a committed plugin tree requires network access, an installed plugin, or coding-agent-local plugin state.
