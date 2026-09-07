PROVIDES backend-neutral Change coordination with local working drafts distinct from published intent and verification evidence
SO THAT Change authoring workflows and their configured storage integrations
CAN refine and repair locally, publish approved intent through the chosen backend, and preserve shared continuation independently of a working copy

## Assertions

### Compliance

- ALWAYS: Change integrations distinguish the published coordination object, its local working draft, and independent verification records ([audit]).
- ALWAYS: authoring workflows own draft semantics and publication policy; SPX draft storage preserves supplied content without applying backend-specific metadata or publication rules ([audit]).
- NEVER: session files under `.spx/sessions/` are treated as Change records or compatibility aliases for Changes ([audit]).
