---
tier: prototype
---

# Methodology Plugin

PROVIDES the Outcome Engineering methodology as committed plugin trees — one coding-agent-native tree per methodology version the product declares and per coding agent the marketplace builds, each carrying a provenance record naming the methodology version it serves, the plugin and exact plugin version it materialized from, the source revision it was copied from, and the content digest of the tree it describes
SO THAT context ingestion, capability reconciliation, and methodology identity inspection
CAN read, reproduce, and compare the methodology the product declares without resolving an installed plugin at run time, reaching the network, or traversing coding-agent-local plugin state

## Assertions

- Committed plugin trees are addressed by methodology version, then coding agent, then plugin name, under a product directory outside the tracked `spx/` tree, so materialized content never enters spec-tree traversal or markdown validation.
- The product carries a committed tree for every methodology version its configuration declares — the target version, and the migration source while one is open — and for every coding agent the marketplace builds, with no tree derived from another coding agent's tree.
- A committed tree holds exactly the plugin resources its foundation-resource manifest names, plus that manifest, rooted at the plugin root so every manifest-declared path resolves unchanged.
- Each committed tree carries a provenance record naming the methodology version the tree serves, the plugin and exact plugin version its bytes materialized from, the source repository and revision the bytes were copied from, and the content digest of the tree it describes.
- Materialization reads a revision of the capability source repository and copies one coding agent's built plugin output; no coding-agent-local install, plugin cache, or marketplace state participates.
- Materialization selects the plugin version whose declared supported-methodology range contains the tree's methodology version, choosing the newest such version, and records that choice in the provenance record; where the published artifact declares no range, the provenance record carries the version selected without one.
- Materialization is deterministic: an identical source revision, plugin version, coding agent, and methodology version produce byte-identical committed trees and provenance records.
- Provenance validation compares each committed tree's recorded digest against that tree's current content and reports divergence as a failure naming the diverging tree.
- ALWAYS: committed plugin trees and their provenance records are machine-written artifacts whose only writer is materialization.
- NEVER: materialization translates, merges, or normalizes one coding agent's native plugin artifacts into another coding agent's format, per `spx/13-agent-capability-lifecycle.pdr.md`.
- NEVER: reading a committed plugin tree requires network access, an installed plugin, or coding-agent-local plugin state.
- NEVER: any consumer reads a coding agent's plugin cache directory to resolve, verify, or enumerate methodology resources.
