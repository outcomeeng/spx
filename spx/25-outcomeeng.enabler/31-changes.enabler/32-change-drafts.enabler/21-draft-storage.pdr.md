# Draft Storage

DEFINES kind AS one path segment of lowercase letters, digits, and hyphens that starts with a letter, named by the caller of a draft operation
DEFINES draft AS one Markdown file of one kind that SPX creates empty under a unique local identifier, and whose content only its caller reads and writes

GOVERNS local drafts of caller-named kinds, shared by every worktree of a repository
SO THAT every workflow that keeps a local working copy
CAN RELY ON one file per draft whose path SPX names before the caller writes anything, reachable from every worktree of the repository, never read or changed by SPX, and removed only by an explicit deletion

## Verification

### Test.Property: creation and listing

- create-names-empty-file: For every kind, draft creation takes no draft text, creates one empty file, and returns its kind, a unique identifier, and its absolute path, so the caller reads and writes only that file.
- shared-storage: For every worktree of a repository, draft storage of a kind resolves to `.spx/drafts/<kind>/` at the Git common-dir product root, so every worktree creates, lists, and deletes the same drafts.
- kind-grammar: For every value, a draft operation accepts it as a kind exactly when it lies in the kind grammar, since SPX keeps no list of kinds, and rejects every other value with a diagnostic naming the value before the operation writes anything for it.
- list-by-kind: For every set of retained drafts, listing one kind reports every retained regular draft file of that kind, and listing without a kind reports every kind's retained regular draft files together, in descending identifier order, newest first, with each descriptor naming its kind, and listing changes no draft.
- draft-identifier-order: For every created draft, its identifier is a lowercase UUIDv7, so of two drafts created in distinct milliseconds, the earlier draft's identifier precedes the later draft's in ordinal order; of two drafts created within one millisecond, identifier order alone decides, and SPX states no creation order between them.

### Test.Compliance: storage

- owner-only-access: ALWAYS: draft files use owner-only access permissions on permission-enforcing filesystems, and creation refuses storage that Git would publish by default.
- no-overwrite-no-escape: NEVER: draft creation overwrites an existing file, or draft deletion accepts an arbitrary path, traversal, another kind's draft, or a symlink as a managed draft.
- content-untouched: NEVER: a draft operation reads, refines, publishes, or changes the content of a draft file after creating it.
- no-migration: NEVER: a draft operation reads, moves, or deletes a file under `.spx/worktree/change-drafts/`.

### Test.Compliance: deletion

- exact-delete: ALWAYS: explicit deletion removes only the identified managed draft of the named kind.
- delete-absent-fails: ALWAYS: deleting a well-formed identifier that names no draft of the named kind changes no draft, reports that absence, and fails.

### Test.Property: deletion

- delete-isolated: For every deletion, the published Changes and the verification records remain unchanged.

### Audit: lifecycle

- no-implicit-removal: NEVER: publication, interruption, failed verification, worktree removal, or elapsed time removes a draft or alters verification evidence.
- no-backend-identity: NEVER: a draft's kind, local identifier, or path carries backend identity or published lifecycle state.
