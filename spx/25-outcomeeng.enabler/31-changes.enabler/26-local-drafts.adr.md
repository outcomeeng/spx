# Local Draft Storage

The draft capability exposes create, list, and delete from `src/lib/change-drafts/` through typed inputs and results, with external effects injected at its boundary. Shared state resolution supplies the worktree-local scope, and the capability owns draft identifiers, Markdown file addressing, local file operations, and descriptor construction. Command handlers under `src/commands/change/` consume that surface; `src/interfaces/cli/change.ts` registers the domain through the static CLI registry and owns stdin, JSON output, diagnostics, and exit codes.

## Rationale

Opaque text storage preserves incomplete drafts and keeps YAML and Change semantics with the authoring workflow. A capability surface lets file operations remain usable independently of Commander, while the shared state API preserves the worktree/common-dir distinction governed by `spx/15-worktree-management.pdr.md` and `spx/17-state.adr.md`; the command split follows `spx/14-cli-composition.adr.md`.

Draft IDs are lowercase UUIDs allocated through an injected generator. Descriptors contain `draftId`, `path`, and `relativePath`; listing sorts by ordinal ID comparison. Creation requires Git to ignore the destination, creates the dedicated draft directory with owner-only access, and opens a new file exclusively with owner read/write access. Existing storage components and candidate files are checked for symlinks and unexpected types before access. The storage directory is private to the invoking account; hostile mutation by another process with that same account's authority is outside the filesystem permission boundary.

Deletion takes an ID, derives its path from the managed scope, and removes one regular file without recursive cleanup. It reports whether the file was removed or was already absent, allowing cleanup retries without republishing. Listing reports descriptors without reading draft bodies; an absent directory is an empty result. File-operation errors retain their operation and path context. No draft operation mutates a shared Change backend, a verification journal, or process-wide working-directory state.

## Invariants

- A successful descriptor's absolute path resolves from its product-relative path against the selected worktree root.
- A failed exclusive create never replaces a pre-existing draft.
- Deleting one identifier cannot select another identifier or a path supplied by the caller.
- Draft operations preserve supplied text rather than interpreting metadata.

## Verification

### Testing

- ALWAYS: exclusive creation rejects collisions without changing existing content, and unsuccessful writing cleans up only the incomplete file created by that operation ([property]).
- ALWAYS: creation checks Git exclusion and safe local storage before writing draft content; listing and deletion reject symlinked storage or candidate entries before following them ([property]).
- ALWAYS: returned JSON preserves external values as data, and human-facing error text escapes external segments through the terminal-text primitive ([property]).

### Audit

- ALWAYS: the capability obtains worktree roots and scope directories through the shared state public API, with no duplicated Git-topology or `.spx/` layout logic ([audit]).
- ALWAYS: filesystem effects, Git-ignore inspection, and identifier generation enter through explicit typed dependencies; pure identifier and descriptor logic accepts values directly ([audit]).
- ALWAYS: command handlers and the CLI descriptor consume the real capability; tests use real temporary repositories and files, with controlled dependencies only for declared failure and collision conditions ([audit]).
- NEVER: tests replace modules or the filesystem through framework interception ([audit]).
- ALWAYS: domain-significant command vocabulary, identifier grammar, file tokens, descriptor fields, and permission values have one source-owned declaration ([audit]).
