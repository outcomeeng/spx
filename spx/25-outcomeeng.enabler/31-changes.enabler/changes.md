# Changes

PROVIDES backend-neutral change records with maturity, node anchoring, refinement, query, and backend capability semantics
SO THAT worktree-backed files, CLI commands, hosted issue trackers, agent handoffs, and other surfaces
CAN record, refine, query, claim, and implement Outcome Engineering work without coupling the product model to one storage backend or interaction surface

## Assertions

### Compliance

- ALWAYS: the backend-neutral changes model declares maturity, product-qualified node anchors, related-node ancestry, priority, blocker handles, and backend status as shared query predicates rather than letting each backend or surface define incompatible filters ([audit])
- ALWAYS: change backends expose records through the product fields and query semantics governed by [`spx/25-outcomeeng.enabler/31-changes.enabler/21-change-store.pdr.md`](21-change-store.pdr.md) ([audit])
- ALWAYS: backend implementations expose change-record behavior through the backend-neutral changes model rather than owning incompatible record shapes per surface ([audit])
- NEVER: session files under `.spx/sessions/` are treated as change records or compatibility aliases for changes ([audit])
