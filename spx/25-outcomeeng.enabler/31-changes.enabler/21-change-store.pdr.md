# Change Store

Changes retain product intent through a configured backend, independently of the working copy used to author them. A local working draft, the published Change, and its verification records stay distinct, and authoring workflows own draft content, independent-verification requirements, publication, and cleanup timing. A draft's local identifier and path carry no backend identity or published lifecycle state.

## Rationale

Local iteration lets authors refine and repair content before presenting it as settled intent through a shared backend. Separating temporary drafts, persisted Changes, and verification records prevents unfinished or rejected revisions from confusing collaborators. Verification records may persist locally or in private hosted storage through the environment-configured verification channel, while the authoring workflow publishes the approved candidate and keeps audit records separate from the Change.

## Product properties

1. Drafts remain local, Git-ignored working files.

## Verification

### Audit

- ALWAYS: authoring workflows own Change semantics, candidate verification, publication, and the decision to retain or delete a local draft ([audit]).
- ALWAYS: authoring workflows publish the unchanged candidate after passing independent verification and keep drafts and verification records separate from the published Change ([audit]).
- NEVER: local draft storage acts as the canonical shared Change backend or treats `.spx/sessions/` records as Changes ([audit]).
