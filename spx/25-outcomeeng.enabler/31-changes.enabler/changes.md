# Changes

PROVIDES backend-neutral change records with maturity, node anchoring, refinement, query, and backend capability semantics
SO THAT worktree-backed files, CLI commands, hosted issue trackers, agent handoffs, and future surfaces
CAN record, refine, query, claim, and implement Outcome Engineering work without coupling the product model to one storage backend or interaction surface

## Assertions

### Compliance

- ALWAYS: the backend-neutral changes model declares maturity, node anchors, related-node ancestry, and backend status as shared query predicates rather than letting each backend or surface define incompatible filters ([audit])
- ALWAYS: backend implementations expose change-record behavior through the backend-neutral changes model rather than owning incompatible record shapes per surface ([audit])
