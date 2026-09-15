# Change Store

Changes retain product intent through a configured backend, independently of the working copy used to author them. SPX manages local Markdown drafts through create, list, and exact-delete operations; authoring workflows own draft content, independent-verification requirements, publication, and cleanup timing. A draft's local identifier and path carry no backend identity or published lifecycle state.

## Rationale

Local iteration lets authors refine and repair content before presenting it as settled intent through a shared backend. Separating temporary drafts, persisted Changes, and verification records prevents unfinished or rejected revisions from confusing collaborators. Verification records may persist locally or in private hosted storage through the environment-configured verification channel, while the authoring workflow publishes the approved candidate and keeps audit records separate from the Change.

## Product properties

1. A caller creates a draft from supplied text and receives its unique local ID, absolute path, and product-relative path. Listing finds retained drafts in the invoking working copy without changing them.
2. Drafts remain local, Git-ignored working files. Their complete supplied text, including any YAML metadata, is preserved without content refinement or backend publication by SPX.
3. Explicit deletion removes only the identified managed draft. Publication, interruption, failed verification, and elapsed time do not implicitly remove drafts or alter verification evidence.

## Verification

### Testing

- ALWAYS: draft creation preserves the supplied text and returns a unique identifier with absolute and product-relative paths ([property]).
- ALWAYS: draft storage resolves to `.spx/worktree/change-drafts/` in the invoking working copy, independently of sibling worktrees ([property]).
- ALWAYS: draft files use owner-only access permissions on permission-enforcing filesystems and creation refuses storage that Git would publish by default ([compliance]).
- ALWAYS: listing is read-only and reports retained regular draft files in deterministic identifier order ([property]).
- NEVER: draft creation overwrites an existing file, or draft deletion accepts an arbitrary path, traversal, or a symlink as a managed draft ([property]).
- NEVER: draft deletion changes published Changes, verification records, or another local draft ([property]).

### Audit

- ALWAYS: authoring workflows own Change semantics, candidate verification, publication, and the decision to retain or delete a local draft ([audit]).
- ALWAYS: authoring workflows publish the unchanged candidate after passing independent verification and keep drafts and verification records separate from the published Change ([audit]).
- NEVER: local draft storage acts as the canonical shared Change backend or treats `.spx/sessions/` records as Changes ([audit]).
