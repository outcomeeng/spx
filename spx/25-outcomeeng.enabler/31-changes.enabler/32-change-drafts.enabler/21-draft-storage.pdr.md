# Draft Storage

SPX manages local Markdown drafts in the invoking working copy through create, list, and exact-delete operations, and stores each draft's supplied text without interpreting it.

## Rationale

Opaque text storage preserves incomplete drafts and keeps YAML and Change semantics with the authoring workflow that owns them, while exact deletion lets that workflow decide when a draft is no longer needed.

## Product properties

1. A caller creates a draft from supplied text and receives its unique local ID, absolute path, and product-relative path. Listing finds retained drafts in the invoking working copy without changing them.
2. A draft's complete supplied text, including any YAML metadata, is preserved without content refinement or backend publication by SPX.
3. Explicit deletion removes only the identified managed draft. Publication, interruption, failed verification, and elapsed time do not implicitly remove drafts or alter verification evidence.

## Verification

- ALWAYS: draft creation preserves the supplied text and returns a unique identifier with absolute and product-relative paths.
- ALWAYS: draft storage resolves to `.spx/worktree/change-drafts/` in the invoking working copy, independently of sibling worktrees.
- ALWAYS: draft files use owner-only access permissions on permission-enforcing filesystems and creation refuses storage that Git would publish by default.
- ALWAYS: listing is read-only and reports retained regular draft files in deterministic identifier order.
- NEVER: draft creation overwrites an existing file, or draft deletion accepts an arbitrary path, traversal, or a symlink as a managed draft.
- NEVER: draft deletion changes published Changes, verification records, or another local draft.
