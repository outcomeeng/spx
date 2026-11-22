# Local Draft Storage

CONSTRAINS the draft capability
TO one library surface with create, list, and delete over injected effects, storing one Markdown file per draft under the shared drafts scope that state resolution supplies
SO THAT draft file operations run and verify independently of any command layer, and a draft has one file from its first byte, with no draft text passing into the capability

## Verification

### Test.Property: identifiers

- draft-identifiers: For every successful creation, the draft identifier is the value that the injected UUIDv7 generator returned, unchanged.

### Test.Compliance: storage safety

- exclusive-create: ALWAYS: creation creates the kind's draft directory with owner-only access, creates the draft file through one exclusive create with owner read/write access, and after a failure removes only the file that operation created.
- storage-checked-before-create: ALWAYS: creation checks Git exclusion and safe local storage before it creates the draft file, and listing and deletion reject symlinked storage or candidate entries before following them.

### Test.Compliance: results

- descriptor-fields: ALWAYS: a descriptor carries `kind`, `draftId`, and `path`, and its absolute path resolves inside the Git common-dir drafts scope of its kind.
- list-order: ALWAYS: listing returns every matching descriptor without reading a draft file, one kind and every kind together alike in descending ordinal identifier order, and an absent directory yields an empty result.
- delete-one-file: ALWAYS: deletion takes a kind and an identifier, derives its path from the managed scope, removes one regular file without recursive cleanup, and reports whether the file was removed or was already absent.
- error-context: ALWAYS: a file-operation error retains its operation and path context.

### Test.Compliance: isolation

- no-foreign-state: NEVER: a draft operation mutates a shared Change backend, a verification journal, or process-wide working-directory state.

### Audit: module

- module-layout: ALWAYS: the capability exposes create, list, and delete from `src/lib/change-drafts/` through typed inputs and results.
- draft-addressing: ALWAYS: shared state resolution supplies the Git common-dir drafts scope `.spx/drafts/`, and the capability owns kind validation, draft identifiers, Markdown file addressing under `.spx/drafts/<kind>/`, local file operations, and descriptor construction.
- injected-effects: ALWAYS: filesystem effects, Git-ignore inspection, and identifier generation enter through explicit typed dependencies, and pure kind, identifier, and descriptor logic accepts values directly.
- single-declaration: ALWAYS: the kind grammar, identifier grammar, file tokens, descriptor fields, and permission values each have one source-owned declaration.
- stateless-identifier-generator: NEVER: the injected UUIDv7 generator keeps a counter or any other state between calls to order identifiers within one millisecond.

### Audit: storage boundary

- storage-private: ALWAYS: the storage directory is private to the invoking account, and mutation by another process with that account's authority lies outside the capability's permission boundary.

### Audit: tests

- real-storage-in-tests: ALWAYS: the capability's tests use real temporary repositories and files, with controlled dependencies only for the declared failure and collision conditions.
