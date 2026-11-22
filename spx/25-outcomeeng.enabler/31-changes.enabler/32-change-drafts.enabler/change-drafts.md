# Change Drafts

PROVIDES creation, discovery, and exact deletion of local Markdown drafts of caller-named kinds, shared by every worktree of a repository, where creation names the one file of a draft before its caller writes it
SO THAT Change authors, independent verifiers, and every workflow that keeps a local working copy
CAN write and revise the one file SPX designates, address the same draft from any worktree, and keep draft storage apart from publication

## Assertions

### Test.Property: creation and listing

- [create-names-empty-file](tests/drafts.property.l1.test.ts): For every kind in the kind grammar, creation takes no draft text, creates one empty file in that kind's draft storage, and returns its kind, local ID, and absolute path; separate successful creations have distinct IDs and files
- shared-storage: For every worktree of a repository, creation, listing, and deletion of one kind address the one directory `.spx/drafts/<kind>/` at the Git common-dir product root, so a draft created from one worktree is listed and deleted from every other worktree
- kind-grammar: For every value, every draft operation accepts it as a kind exactly when it lies in the kind grammar, consults no list of kinds, and otherwise rejects it with a diagnostic naming the value and writes nothing
- [list-by-kind](tests/drafts.property.l1.test.ts): For every set of retained drafts, listing one kind returns exactly that kind's managed regular draft files, and listing every kind returns every kind's managed regular draft files together, in descending identifier order, newest first, with each descriptor naming its kind, listing changes no content, and an absent draft directory returns an empty list without creating directories
- draft-identifiers: For every successful creation, the returned local ID is the value that the injected UUIDv7 generator returned, unchanged
- draft-identifier-order: For every sequence of successful creations, each returned local ID is a lowercase UUIDv7, and it precedes in ordinal order the local ID of every creation in a later millisecond; for creations within one millisecond, the IDs' ordinal order alone fixes their listing order

### Test.Property: deletion

- [delete-isolated](tests/drafts.property.l1.test.ts): For every managed draft, its deletion leaves every published Change and every verification record unchanged

### Test.Compliance: storage safety

- owner-only-access: ALWAYS: created draft files and their kind directories are accessible only to their owner on permission-enforcing filesystems, and creation refuses a storage destination that Git would publish by default
- no-overwrite-no-escape: NEVER: creation overwrites an existing candidate path, or deletion accepts traversal, an arbitrary path, another kind's draft, or a symlink as a managed draft
- exclusive-create: ALWAYS: creation creates the kind directory with owner-only access and the draft file through one exclusive create with owner read/write access, and a failed creation removes only the file that operation created and leaves every pre-existing file unchanged
- storage-checked-before-create: ALWAYS: creation refuses unsafe storage components and a Git-visible storage destination before it creates the draft file, and listing and deletion reject a symlinked storage directory or candidate entry before following it
- malformed-identifier-rejected: NEVER: deletion accepts a malformed draft identifier, a lowercase UUID of a version other than 7 included, as naming a managed draft

### Test.Compliance: results

- descriptor-fields: ALWAYS: every descriptor that creation or listing returns carries `kind`, `draftId`, and `path`, and its absolute path lies inside `.spx/drafts/<kind>/` of its own kind
- list-order: ALWAYS: listing reads no draft file, orders one kind's descriptors and every kind's descriptors together alike by descending ordinal identifier comparison, and returns an empty result for an absent directory
- delete-one-file: ALWAYS: deletion of a kind and an identifier derives the path from the managed scope, removes exactly one regular file without recursive cleanup, and reports the file removed, or already absent for a valid identifier with no file
- error-context: ALWAYS: a failed file operation returns an error naming that operation and the path it acted on

### Test.Compliance: isolation

- content-untouched: NEVER: a draft operation reads, parses, or changes the content a caller wrote to a draft file; only the deletion of that draft removes it
- no-migration: NEVER: a draft operation reads, moves, or deletes a file under `.spx/worktree/change-drafts/`
- exact-delete: ALWAYS: deletion removes only the identified draft of its kind, and leaves every other draft unchanged, whichever worktree created it
- delete-absent-fails: ALWAYS: deletion of a lowercase UUIDv7 identifier that names no draft of its kind leaves every draft unchanged and returns a failed result that reports the absence
- no-foreign-state: NEVER: a draft operation mutates a shared Change backend, a verification journal, or the process working directory

### Audit: lifecycle

- no-implicit-removal: NEVER: a draft is removed, or verification evidence altered, on publication, interruption, failed verification, worktree removal, or elapsed time; a removal path other than explicit deletion fails.
- no-backend-identity: NEVER: a draft's kind, local ID, or path carries backend identity or published lifecycle state; a descriptor field, file name, or directory name derived from a backend identifier fails.

### Audit: architecture

- module-layout: ALWAYS: create, list, and delete are exported from `src/lib/change-drafts/` through typed inputs and results; a draft operation implemented outside that library fails.
- draft-addressing: ALWAYS: the capability obtains the drafts scope `.spx/drafts/` from shared state resolution and itself owns kind validation, draft identifiers, Markdown file addressing under `.spx/drafts/<kind>/`, local file operations, and descriptor construction; a second owner of any of these fails.
- injected-effects: ALWAYS: filesystem effects, Git-ignore inspection, and identifier generation enter through explicit typed dependencies, and pure kind, identifier, and descriptor logic accepts values directly; an effect reached without an injected dependency fails.
- single-declaration: ALWAYS: the kind grammar, identifier grammar, file tokens, descriptor fields, and permission values each have one source-owned declaration; a repeated literal of any of them fails.
- stateless-identifier-generator: NEVER: the injected UUIDv7 generator keeps a counter or any other state between calls to order identifiers within one millisecond; a generator that carries state from one call to the next fails.
- storage-private: ALWAYS: the capability treats its storage directory as private to the invoking account, and mutation by another process with that account's authority as outside its permission boundary; a claim of protection against that process fails.

### Audit: test infrastructure

- real-storage-in-tests: ALWAYS: the capability's tests use real temporary repositories and files, with controlled dependencies only for the declared failure and collision conditions; any other controlled dependency fails.
- draft-test-infrastructure: ALWAYS: `testing/generators/change-drafts.ts` owns variable kind and draft content domains and `testing/harnesses/change-drafts.ts` owns real temporary repository and linked-worktree lifecycle and failure injection, and executed tests own all pass/fail predicates; a pass/fail predicate inside a generator or harness fails.
