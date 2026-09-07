# Change Drafts

PROVIDES private working-copy-local Markdown draft creation, discovery, and exact deletion
SO THAT Change authors and independent verifiers
CAN iterate on retained local content and address the same candidate without coupling draft storage to publication

## Assertions

- For every supplied draft text, creation retains that text unchanged and returns its local ID, absolute path, and normalized product-relative path; separate successful creations have distinct IDs and files.
- ALWAYS: creation refuses an existing candidate path, unsafe storage components, and a Git-visible storage destination without overwriting content; created draft files and their dedicated directory are accessible only to their owner on permission-enforcing filesystems.
- For every invoking working copy, listing returns exactly its managed regular draft files in identifier order and changes no content; an absent draft directory returns an empty list without creating directories.
- NEVER: deletion accepts a malformed draft identifier, traversal, an arbitrary path, or a symlink as a managed draft; a missing valid identifier reports absence without deleting other files.
- For every managed draft, deletion removes only its identified file; other drafts, sibling-worktree drafts, published records, and verification evidence remain unchanged.
- ALWAYS: storage accepts incomplete authoring text without parsing YAML or adding metadata, verification outcomes, or backend identifiers.
- ALWAYS: `testing/generators/change-drafts.ts` owns variable draft input domains and `testing/harnesses/change-drafts.ts` owns real temporary repository lifecycle and failure injection; executed tests own all pass/fail predicates.
