# Ignore Defaults

## Purpose

This decision governs which filesystem entries the file-inclusion service excludes by default during automatic walking, and which entries an explicit caller-supplied path always includes regardless of default filters. It applies to every file-inclusion consumer under the spx harness — validation stages, spec-tree walkers, test infrastructure, and session tooling.

## Context

**Business impact:** Every spx command that touches the filesystem makes inclusion decisions. Defaults that surface build artifacts, dotfiles, or caller-declared excluded nodes as candidates pollute tool output with noise and produce findings against paths no consumer intended to process. An operator who asks spx to operate on a specific path expects that path to be operated on — defaults must not silently refuse explicit intent.

**Technical constraints:** spx runs against real filesystems that contain version-control and build artifact directories, dotfile-prefixed metadata, and a tracked ignore-source file whose entries declare spec-tree nodes outside the active quality-gate scope.

## Decision

The file-inclusion service excludes three categories from every automatic walk: entries under any configured artifact directory; entries whose basename starts with the configured hidden prefix; entries under any spec-tree node listed in the configured ignore-source file. A caller that supplies explicit paths to the resolver bypasses all layers — every supplied path is included with a decision trail naming the explicit-override layer.

## Rationale

Excluding artifact directories by default matches the behavior every downstream tool (eslint, tsc, madge, knip, markdownlint, pytest, vitest) already implements — but each implements it with a different mechanism, producing silent drift when one tool's filter is narrower than another's. Centralizing the default in the file-inclusion service eliminates that drift class: a file that is not a candidate for the walker is not a candidate for any adapter.

Excluding dotfiles by default matches ripgrep's default behavior and the common expectation that dot-prefixed entries are metadata — git internals, editor caches, OS detritus — rather than product content. Explicit-caller override preserves the ability to process dotfiles when a consumer has a reason: an operator running `spx validation literal --files .claude/rules.ts` has declared intent, and the service honors it.

Respecting the ignore-source file is the tracked-spec-tree scope-skipping mechanism: the ignore source declares which spec-tree nodes lie outside the active quality-gate scope, and every walker consults it once through the file-inclusion service.

Explicit-caller override is the key invariant. A service that silently drops caller-supplied paths — because they match an artifact directory, start with a dot, or appear under an ignore-source entry — converts a clear operator command into an empty operation with no diagnostic. Ripgrep's override rule ("File paths specified on the command line override glob and ignore") is the established convention; the file-inclusion service adopts it verbatim.

Alternatives considered:

- **Per-consumer default configuration.** Each consumer maintains its own ignore defaults. Rejected because that pattern produces the drift-and-duplication class the file-inclusion service exists to eliminate.
- **Opt-in ignore layers.** Consumers explicitly register which layers apply to their walk. Rejected because every consumer that touches the filesystem needs the same layers; opt-in ceremony produces forgotten opt-ins and the drift class returns.
- **No explicit-caller override.** Treat `--files`-supplied paths as subject to every ignore layer. Rejected because the resulting behavior ("I asked for this file and spx silently skipped it") is a surprise-to-the-operator class that dwarfs the noise the defaults protect against.

## Trade-offs accepted

| Trade-off                                                                 | Mitigation / reasoning                                                                                                                              |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit-caller paths under artifact directories are processed            | The override is an intentional opt-in expressed at the call site; the caller bears the responsibility for what they supply                          |
| Default artifact list is declared once and consumed by every tool         | Tool-specific exclusions beyond the default set live in each tool's own config (tsconfig `exclude`, `eslint.config.ts`), unchanged by this decision |
| Ignore-source entries under a caller-supplied explicit path are processed | The override is a deliberate reversal of the scope-skipping mechanism; the caller has asserted the node is in scope for this specific invocation    |

## Product invariants

- A caller that supplies a path to the file-inclusion scope resolver always receives that path in the included set, with a decision trail naming the explicit-override layer
- A walker that does not supply explicit paths receives a resolved scope in which no entry lives under a configured artifact directory, no entry's basename starts with the configured hidden prefix, and no entry lives under a node listed in the configured ignore source

## Compliance

### Recognized by

An operator running `spx validation literal --files dist/x.ts` sees the file processed. An operator running `spx validation literal` without explicit paths sees no findings from files under configured artifact directories, from dot-prefixed entries, or from nodes listed in the configured ignore source. Every scope result carries a decision trail naming the layer responsible for each exclusion.

### MUST

- The scope resolver reports every caller-supplied explicit path as included with a decision trail naming the explicit-override layer ([review])
- An automatic walk with no explicit paths excludes every entry matching the artifact-directory layer, the hidden-prefix layer, and the ignore-source layer; every excluded path carries a decision trail naming the responsible layer ([review])

### NEVER

- Drop, rewrite, or silently filter a caller-supplied explicit path — the override is absolute ([review])
