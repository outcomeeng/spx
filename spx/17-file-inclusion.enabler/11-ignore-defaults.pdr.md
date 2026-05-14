# Ignore Defaults

## Purpose

This decision governs which filesystem entries the file-inclusion service excludes by default during automatic walking, and which entries an explicit caller-supplied path always includes regardless of default filters. Consumer domains supply their own config-backed path filters through registered config descriptors; the file-inclusion service supplies shared path predicates, decision trails, and tool-adapter behavior.

## Context

**Business impact:** Every spx command that touches the filesystem makes inclusion decisions. Defaults that surface build artifacts, dotfiles, or caller-declared excluded paths as candidates pollute tool output with noise and produce findings against paths no consumer intended to process. An operator who asks spx to operate on a specific path expects that path to be operated on — defaults must not silently refuse explicit intent.

Validation, testing, auditing, and reviewing commands face separate policy requirements. Validation path filters suppress quality-debt output. Testing path filters narrow the passing-scope lens used by `spx test passing` and status reporting. Auditing and reviewing path filters select targets and persisted state without changing validation or testing policy.

**Technical constraints:** spx runs against real filesystems that contain version-control and build artifact directories, dotfile-prefixed metadata, and a single product config file resolved through `spx/16-config.enabler/`.

## Decision

The file-inclusion service defines shared path layers and consumes caller-supplied domain path filters. Domain policy is declared by config descriptors; file-inclusion does not own the meaning of a path filter beyond inclusion and exclusion mechanics.

**Shared layers** (applied by every consumer):

- Artifact-directory layer: entries under any configured artifact directory are excluded from every automatic walk.
- Hidden-prefix layer: entries whose basename starts with the configured hidden prefix are excluded from every automatic walk.

**Domain path-filter layer** (applied only when supplied by a consumer):

- The caller passes a typed path filter resolved from its domain config descriptor. An operator who supplies an `exclude` pattern suppresses matching paths for that domain. An operator who supplies an `include` pattern restricts that domain's walk to matching paths only.
- Validation reads `validation.paths` from `spx.config.{toml,json,yaml}` for quality-debt suppression.
- Testing reads its own config-backed passing-scope filter from `spx.config.{toml,json,yaml}` for `spx test passing` and status semantics.
- Auditing and reviewing read their own descriptors for target selection and persisted execution state.

A caller that supplies explicit paths to the resolver bypasses all layers — every supplied path is included with a decision trail naming the explicit-override layer.

## Rationale

Excluding artifact directories by default matches the behavior every downstream tool (eslint, tsc, madge, knip, markdownlint, pytest, vitest) already implements — but each implements it with a different mechanism, producing silent drift when one tool's filter is narrower than another's. Centralizing the default in the file-inclusion service eliminates that drift class: a file that is not a candidate for the walker is not a candidate for any adapter.

Excluding dotfiles by default matches ripgrep's default behavior and the common expectation that dot-prefixed entries are metadata — git internals, editor caches, OS detritus — rather than product content. Explicit-caller override preserves the ability to process dotfiles when a consumer has a reason: an operator running `spx validation literal --files .claude/rules.ts` has declared intent, and the service honors it.

Config-backed path filters keep domain semantics explicit. An operator who excludes a path from validation is suppressing validation output for that path; an operator who excludes a node from testing passing scope is narrowing status semantics for that node; an operator who scopes audit or review targets is selecting agent execution targets. The common include/exclude structure is reusable, while the meaning belongs to the domain descriptor that exposes it.

The `validation.paths` config is the validation-specific exclusion mechanism. It matches the pattern every major linting and type-checking tool already exposes (`.eslintignore`, `tsconfig.exclude`, `.prettierignore`): a product-level list of path patterns that suppress tool output for the listed paths. Using product-level config rather than per-tool config centralizes this for all spx validation commands and avoids the drift that independent per-tool ignore files produce.

Explicit-caller override is the key invariant. A service that silently drops caller-supplied paths — because they match an artifact directory, start with a dot, or match a domain path filter — converts a clear operator command into an empty operation with no diagnostic. Ripgrep's override rule ("File paths specified on the command line override glob and ignore") is the established convention; the file-inclusion service adopts it verbatim.

Alternatives considered:

- **Per-consumer default configuration.** Each consumer maintains its own ignore defaults. Rejected because that pattern produces the drift-and-duplication class the file-inclusion service exists to eliminate for the shared layers. Consumer-specific policy lives in descriptors; shared path mechanics stay centralized.
- **Single global path filter.** One top-level exclude list suppresses every domain. Rejected because validation quality debt, testing passing scope, audit target selection, and review execution targets have different meanings and should not silently affect one another.
- **No explicit-caller override.** Treat `--files`-supplied paths as subject to every ignore layer. Rejected because the resulting behavior ("I asked for this file and spx silently skipped it") is a surprise-to-the-operator class that dwarfs the noise the defaults protect against.

## Trade-offs accepted

| Trade-off                                                                 | Mitigation / reasoning                                                                                                                              |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit-caller paths under artifact directories are processed            | The override is an intentional opt-in expressed at the call site; the caller bears the responsibility for what they supply                          |
| Default artifact list is declared once and consumed by every tool         | Tool-specific exclusions beyond the default set live in each tool's own config (tsconfig `exclude`, `eslint.config.ts`), unchanged by this decision |
| Each domain owns its own path-filter meaning                              | The shared config primitive validates structure; domain descriptors name the section and default policy                                             |
| Validation paths are config-file-only (no dedicated ignore file per tool) | A single `spx.config.*` entry centralizes exclusions across all spx validation commands; operators do not maintain per-tool ignore files            |

## Product invariants

- A caller that supplies a path to the file-inclusion scope resolver always receives that path in the included set, with a decision trail naming the explicit-override layer
- A consumer that does not supply explicit paths receives a resolved scope in which no entry lives under a configured artifact directory and no entry's basename starts with the configured hidden prefix
- A consumer that supplies a config-backed path filter receives a resolved scope additionally filtered by that domain's include/exclude patterns
- Domain path filters do not affect other domains unless that other domain explicitly consumes the same descriptor section

## Compliance

### Recognized by

An operator running `spx validation literal --files dist/x.ts` sees the file processed. An operator running `spx validation literal` without explicit paths sees no findings from files under configured artifact directories or from dot-prefixed entries. A path excluded from testing passing scope does not disappear from validation output. Every scope result carries a decision trail naming the layer responsible for each exclusion.

### MUST

- The scope resolver reports every caller-supplied explicit path as included with a decision trail naming the explicit-override layer ([review])
- An automatic walk with no explicit paths excludes every entry matching the artifact-directory layer and the hidden-prefix layer; every excluded path carries a decision trail naming the responsible layer ([review])
- A consumer-supplied config path filter applies only to that consumer's scope result and carries decision-trail entries for include/exclude matches ([review])
- Validation, testing, auditing, and reviewing obtain path-filter structure from their domain descriptors; file-inclusion does not parse `spx.config.*` directly ([review])

### NEVER

- Drop, rewrite, or silently filter a caller-supplied explicit path — the override is absolute ([review])
- Apply one domain's path filter to another domain's scope unless that domain explicitly consumes the same descriptor section ([review])
- Read a standalone ignore-source file to decide scope — scope policy is config-backed through registered descriptors ([review])
