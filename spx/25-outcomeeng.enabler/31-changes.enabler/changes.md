# Changes

PROVIDES backend-neutral change records with maturity, node anchoring, refinement, query, and backend capability semantics
SO THAT worktree-backed files, CLI commands, hosted issue trackers, agent handoffs, and future surfaces
CAN record, refine, query, claim, and implement Outcome Engineering work without coupling the product model to one storage backend or interaction surface

## Assertions

### Compliance

- ALWAYS: change records carry enough structured product context for agents and surfaces to query by maturity, node ownership, related node ancestry, and backend status ([audit])
- ALWAYS: backend implementations expose change-record behavior through the backend-neutral changes model rather than owning incompatible record shapes per surface ([audit])
