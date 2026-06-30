PROVIDES backend-neutral change records with maturity, node anchoring, refinement, query, and backend capability semantics
SO THAT worktree-backed files, CLI commands, hosted issue trackers, agent handoffs, and other surfaces
CAN record, refine, query, claim, and implement Outcome Engineering work without coupling the product model to one storage backend or interaction surface

## Assertions

### Compliance

- ALWAYS: the backend-neutral changes model defines backend-qualified handles, backend-local ids, titles, contexts, next steps, maturity, product identities, product-qualified node anchors, priorities, blocker handles, origins, backend-owned status, exact-node queries, related-node queries, and claimability semantics as shared product vocabulary rather than backend-local terminology ([audit])
- ALWAYS: change backends and surfaces preserve the backend-neutral changes model instead of defining incompatible record shapes, filters, ownership semantics, or dependency semantics per storage backend or interaction surface ([audit])
- NEVER: session files under `.spx/sessions/` are treated as change records or compatibility aliases for changes ([audit])
