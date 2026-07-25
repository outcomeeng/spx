# Methodology Package

PROVIDES the Outcome Engineering methodology as committed package trees — one native tree per coding agent the methodology source builds, each carrying a provenance record naming the exact methodology version and the content digest of the tree it describes
SO THAT context ingestion, capability reconciliation, and methodology identity inspection
CAN read, reproduce, and compare the methodology the product declares without resolving an installed package at run time, reaching the network, or traversing agent-local plugin state

## Assertions

- Every coding agent the methodology source builds has its own committed package tree, and no tree is derived from another agent's tree.
- Each committed package tree carries a provenance record naming the exact methodology version and the content digest of the tree it describes.
- Each provenance record's declared methodology version equals the exact version the top-level `methodology` config descriptor resolves under `spx/16-config.enabler/43-methodology-config.enabler`.
- Materialization is deterministic: an identical methodology source and version produce byte-identical committed trees and provenance records.
- Provenance validation compares each committed tree's recorded digest against that tree's current content, and against the installed methodology package when one is present, reporting divergence as a failure that names the diverging tree.
- ALWAYS: committed package trees and their provenance records are machine-written artifacts whose only writer is materialization.
- NEVER: materialization translates, merges, or normalizes one coding agent's native package artifacts into another coding agent's format, per `spx/13-agent-capability-lifecycle.pdr.md`.
- NEVER: reading a committed package tree requires network access, an installed methodology package, or agent-local plugin state.
