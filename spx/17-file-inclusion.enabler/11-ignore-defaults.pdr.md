# Ignore Defaults

## Purpose

This decision governs which filesystem entries the file-inclusion service excludes by default during automatic walking, and which entries an explicit caller-supplied path always includes regardless of default filters. Two consumer classes are distinguished: spec-tree quality-gate walkers (test runners, spec-tree library traversals) and validation commands (lint, type-check, literal-reuse detection). Each class applies a different set of exclusion layers.

## Context

**Business impact:** Every spx command that touches the filesystem makes inclusion decisions. Defaults that surface build artifacts, dotfiles, or caller-declared excluded nodes as candidates pollute tool output with noise and produce findings against paths no consumer intended to process. An operator who asks spx to operate on a specific path expects that path to be operated on — defaults must not silently refuse explicit intent.

Validation commands face a separate requirement: teams adopting new lint or type rules need to exclude legacy code, work-in-progress directories, and vendored paths from tool output without coupling those exclusions to the spec-tree quality-gate mechanism.

**Technical constraints:** spx runs against real filesystems that contain version-control and build artifact directories, dotfile-prefixed metadata, and a tracked ignore-source file whose entries declare spec-tree nodes outside the active quality-gate scope.

## Decision

The file-inclusion service defines two exclusion layer sets applied by different consumer classes.

**Shared layers** (applied by every consumer):

- Artifact-directory layer: entries under any configured artifact directory are excluded from every automatic walk.
- Hidden-prefix layer: entries whose basename starts with the configured hidden prefix are excluded from every automatic walk.

**Quality-gate layer** (applied only by spec-tree quality-gate walkers):

- Ignore-source layer: entries under any spec-tree node listed in the configured ignore-source file (`spx/EXCLUDE`) are excluded. This layer declares which spec-tree nodes lie outside the active quality-gate scope — it has no bearing on validation tool output.

**Validation path layer** (applied only by validation commands):

- Validation commands read `validation.paths` from `spx.config.yaml`. An operator who supplies `validation.paths.exclude` patterns suppresses matching paths from all validation tool output. An operator who supplies `validation.paths.include` restricts the walk to matching paths only. The ignore-source file is not consulted.

A caller that supplies explicit paths to the resolver bypasses all layers — every supplied path is included with a decision trail naming the explicit-override layer.

## Rationale

Excluding artifact directories by default matches the behavior every downstream tool (eslint, tsc, madge, knip, markdownlint, pytest, vitest) already implements — but each implements it with a different mechanism, producing silent drift when one tool's filter is narrower than another's. Centralizing the default in the file-inclusion service eliminates that drift class: a file that is not a candidate for the walker is not a candidate for any adapter.

Excluding dotfiles by default matches ripgrep's default behavior and the common expectation that dot-prefixed entries are metadata — git internals, editor caches, OS detritus — rather than product content. Explicit-caller override preserves the ability to process dotfiles when a consumer has a reason: an operator running `spx validation literal --files .claude/rules.ts` has declared intent, and the service honors it.

The ignore-source file is the spec-tree quality-gate mechanism: it declares which spec-tree nodes lie outside the active quality-gate scope because their implementation is absent and their tests are intentionally deferred. This semantic is specific to the spec-tree test lifecycle and does not apply to validation tools. An operator who adds a new lint rule to a project does not want existing deferred spec-tree nodes to escape linting automatically — they want an independent exclusion mechanism.

The `validation.paths` config is the validation-specific exclusion mechanism. It matches the pattern every major linting and type-checking tool already exposes (`.eslintignore`, `tsconfig.exclude`, `.prettierignore`): a project-level list of path patterns that suppress tool output for the listed paths. Using a project-level config rather than a per-tool config centralizes this for all spx validation commands and avoids the drift that independent per-tool ignore files produce.

Explicit-caller override is the key invariant. A service that silently drops caller-supplied paths — because they match an artifact directory, start with a dot, or appear under an ignore-source entry — converts a clear operator command into an empty operation with no diagnostic. Ripgrep's override rule ("File paths specified on the command line override glob and ignore") is the established convention; the file-inclusion service adopts it verbatim.

Alternatives considered:

- **Per-consumer default configuration.** Each consumer maintains its own ignore defaults. Rejected because that pattern produces the drift-and-duplication class the file-inclusion service exists to eliminate for the shared layers. The consumer-class split (quality-gate vs. validation) is a deliberate distinction at the semantic level, not a reversion to per-consumer drift.
- **Apply the ignore-source layer to all consumers.** Make `spx/EXCLUDE` suppress validation findings. Rejected because the ignore-source semantic is "this spec-tree node is outside the quality-gate scope," which is unrelated to whether code should be linted. Entangling these semantics produces silent false negatives in validation: a directory excluded from test-gate counting automatically escapes linting.
- **No explicit-caller override.** Treat `--files`-supplied paths as subject to every ignore layer. Rejected because the resulting behavior ("I asked for this file and spx silently skipped it") is a surprise-to-the-operator class that dwarfs the noise the defaults protect against.

## Trade-offs accepted

| Trade-off                                                                 | Mitigation / reasoning                                                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Explicit-caller paths under artifact directories are processed            | The override is an intentional opt-in expressed at the call site; the caller bears the responsibility for what they supply                             |
| Default artifact list is declared once and consumed by every tool         | Tool-specific exclusions beyond the default set live in each tool's own config (tsconfig `exclude`, `eslint.config.ts`), unchanged by this decision    |
| Quality-gate layer and validation-path layer are separate mechanisms      | The semantic distinction is intentional: `spx/EXCLUDE` means "not yet in scope for testing"; `validation.paths` means "suppress this from tool output" |
| Validation paths are config-file-only (no dedicated ignore file per tool) | A single `spx.config.yaml` entry centralizes exclusions across all spx validation commands; operators do not maintain per-tool ignore files            |

## Product invariants

- A caller that supplies a path to the file-inclusion scope resolver always receives that path in the included set, with a decision trail naming the explicit-override layer
- A quality-gate walker that does not supply explicit paths receives a resolved scope in which no entry lives under a configured artifact directory, no entry's basename starts with the configured hidden prefix, and no entry lives under a node listed in the configured ignore source
- A validation command that does not supply explicit paths receives a resolved scope in which no entry lives under a configured artifact directory, no entry's basename starts with the configured hidden prefix; entries are additionally filtered by `validation.paths` when that config is present; the ignore-source file is not consulted

## Compliance

### Recognized by

An operator running `spx validation literal --files dist/x.ts` sees the file processed. An operator running `spx validation literal` without explicit paths sees no findings from files under configured artifact directories or from dot-prefixed entries. Files under `spx/EXCLUDE` nodes are NOT automatically excluded from validation output — only from spec-tree quality-gate walkers. Every scope result carries a decision trail naming the layer responsible for each exclusion.

### MUST

- The scope resolver reports every caller-supplied explicit path as included with a decision trail naming the explicit-override layer ([review])
- A quality-gate walker automatic walk with no explicit paths excludes every entry matching the artifact-directory layer, the hidden-prefix layer, and the ignore-source layer; every excluded path carries a decision trail naming the responsible layer ([review])
- A validation command automatic walk with no explicit paths excludes every entry matching the artifact-directory layer and the hidden-prefix layer; entries matching `validation.paths.exclude` patterns are additionally excluded; the ignore-source layer is not applied ([review])

### NEVER

- Drop, rewrite, or silently filter a caller-supplied explicit path — the override is absolute ([review])
- Apply the ignore-source layer to validation commands — `spx/EXCLUDE` is a quality-gate mechanism, not a validation-suppression mechanism ([review])
- Apply `validation.paths` filtering to quality-gate walkers — the semantics are distinct ([review])
