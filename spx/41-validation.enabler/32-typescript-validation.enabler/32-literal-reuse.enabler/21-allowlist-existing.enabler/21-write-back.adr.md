# Allowlist Write-Back

## Purpose

This decision governs how the `--allowlist-existing` helper persists allowlist entries to `spx.config.*` at the project root — which file is written, how the original syntax format is preserved, write atomicity, the file-creation path when no config exists, exit-code semantics, and dependency injection of filesystem reader and writer.

## Context

**Business impact:** A bulk-silence helper that writes the project's main configuration file is high-trust. A non-atomic write that crashes mid-flight corrupts the config and forces manual recovery; a write that loses the user's comments or reorders unrelated sections erodes trust enough to disable the feature. Atomic, format-preserving writes are the difference between a helper agents and operators run without supervision and a helper that lives behind a manual review checklist.

**Technical constraints:** The config module detects the active config file by scanning the project root for `spx.config.{json,yaml,toml}` and returns an ambiguity result when more than one is present. The helper must use the same detection — running its own search would diverge from the read path and produce surprising write targets. POSIX `rename` is atomic when source and destination share a filesystem. Raw config parsing and serialization live in `src/config/`; the helper consumes config-file and section APIs rather than importing JSON, YAML, or TOML parsers itself.

## Decision

The helper writes back through the same file the config module detects — preserving the file's syntax format and unrelated config sections through config-owned parse and serialize APIs — using a temp-file-plus-atomic-rename pattern, accepting reader and writer dependencies through command options for `l1` testability.

## Rationale

Reusing `resolveConfig`'s file detection — including its multi-file ambiguity error path — collapses read and write into a single decision about *which file is the project config*. Any divergence between read-side and write-side detection produces a write that targets the wrong file, with no way for the user to predict which file would be touched. Returning the same ambiguity error for the write path mirrors the read-side guarantee; the helper writes nothing rather than guess.

Format preservation matches the user's choice of config syntax — JSON, YAML, or TOML. Round-tripping through the config module keeps unrelated top-level sections intact and keeps all format-specific parser and serializer choices in one owner. A serializer-free approach (read raw text, locate the section, append entries) is rejected because it cannot generalize across three formats and breaks on any non-trivial existing structure.

The temp-file-plus-rename pattern is the standard idiom for atomic single-file writes. A direct write to the destination file leaves a window during which a concurrent reader, a power loss, or a process crash observes a partial file. Renaming a fully-written temp file is atomic on the destination filesystem; readers either see the old file or the new file, never a partial write.

When no `spx.config.*` exists at the project root, the helper creates `spx.config.yaml`. YAML is the ergonomic default for human-edited configs (comments, hierarchical structure, no quote noise) and matches the format spx uses for its own project config. Writing JSON-by-default is defensible but produces a file with weaker affordances for the user's later maintenance.

Dependency injection of reader and writer follows the convention established by `32-allowlist-config.adr.md` — `LiteralCommandOptions` accepts an optional `config?: LiteralConfig` for `l1` testability. The same pattern extends here: the helper's options accept optional reader and writer implementations. Production runs use the real `resolveConfig` and the temp-file-plus-rename adapter; `l1` tests inject deterministic implementations that operate against `withTestEnv` temp directories per `22-test-environment.enabler` conventions, verifying behavior without filesystem mocking.

Alternatives considered:

- **Always write `spx.config.yaml` regardless of existing format.** Rejected because a project that committed to JSON or TOML would suddenly carry a second config file in a different format; the next `resolveConfig` invocation triggers the ambiguity error path.
- **Direct write without temp-rename.** Rejected because it admits a partial-write window observable by concurrent readers and unsafe under crash. The cost of the temp-rename is one extra `fs.rename` syscall; the benefit is crash-safety.
- **In-process serializer abstraction with a single canonical AST.** Rejected because the abstraction must be lossy (the canonical AST cannot model every format's structural quirks) and re-implementing comment preservation across three formats is heavier than three round-trip calls into existing serializers.
- **Reject when `spx.config.*` does not exist (require user to create the file first).** Rejected because the spec assertion mandates that running the helper produces a working state in one operation. Forcing a manual file-create step contradicts the bulk-silence goal.

## Trade-offs accepted

| Trade-off                                                             | Mitigation / reasoning                                                                                                                        |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Config-owned serializers must support both read and write paths       | One format registry owns JSON, YAML, and TOML parsing/serialization, so downstream helpers do not drift from config resolution                |
| Comments are not part of the section-level write contract             | The helper preserves sections and values; comment-preserving edits require a richer config-module mutation API rather than local text surgery |
| Default file creation chooses YAML over the user's untold preference  | The user can rename or convert the file on first edit; the helper never overwrites a file the user did not consent to                         |
| Atomic rename relies on temp file and target sharing a filesystem     | The helper writes the temp file alongside the target in the project root; project root and its sibling temp file always share a filesystem    |
| Write target is determined at run time by `resolveConfig`'s detection | Behavior is identical to the read path the user already runs; no new "which file?" question is introduced                                     |

## Invariants

- For every successful run against a non-empty findings set, the post-write file parses cleanly through `resolveConfig` and yields a literal config whose `include` set equals the union of the pre-write set and the newly added values.
- For every successful run, the post-write file's syntax format equals the pre-read file's syntax format (or YAML when no pre-read file existed).
- For every interrupted run (process termination between temp-write and rename), the destination file's contents are identical to the pre-run state.
- For every consecutive pair of runs against unchanged source, the post-second-run file's `include` set is identical to the post-first-run set.

## Compliance

### Recognized by

A single write entry point in `src/validation/literal/allowlist-existing.ts` that accepts an options argument carrying optional `reader` and `writer` dependencies. The production reader resolves to `resolveConfig`; the production writer resolves to a temp-file-plus-rename adapter exported from a single module. No code path outside this module performs filesystem writes against `spx.config.*`.

### MUST

- The write target equals the file detected by the config module for `projectRoot` — when config detection returns ambiguity, the helper exits non-zero with the same error and writes nothing ([review])
- The post-write file syntax format equals the pre-read file syntax format (YAML round-trips to YAML, JSON to JSON, TOML to TOML); when no pre-read file exists, the helper creates `spx.config.yaml` ([review])
- Format-preserving parsing and serialization route through `src/config/`; the helper never imports raw JSON, YAML, or TOML parsers ([review])
- Writes are atomic: the helper writes to a sibling temp file in the project root, then renames over the destination — readers observe the old file or the new file, never a partial state ([review])
- Exit code is 0 when the write completes (including the no-op case where the findings set is empty); exit code is non-zero when `resolveConfig` returns an error or any filesystem operation fails ([review])
- The helper's options accept optional `reader` and `writer` dependencies — when omitted, defaults resolve to the production config-file reader and the production temp-file-plus-rename adapter; when supplied, the helper bypasses production detection and uses the injected implementations ([review])

### NEVER

- Write directly to `spx.config.*` without the temp-file-plus-rename pattern — admits a partial-write window observable by concurrent readers and unsafe under crash ([review])
- Translate the file's format on write (parse YAML and emit JSON, parse TOML and emit YAML, etc.) — silently changes the user's choice of config syntax ([review])
- Re-implement project-root file detection inside the helper — divergence from `resolveConfig`'s detection produces unpredictable write targets ([review])
- `vi.mock()`, `jest.mock()`, or any filesystem-mocking mechanism in tests for the helper — `l1` tests inject real reader and writer adapters that operate on `withTestEnv` temp directories per `22-test-environment.enabler` conventions ([review])
- Cast the resolved-config result to `any` to bypass the typed return shape from `resolveConfig` — defeats the type-level enforcement of the read-write contract ([review])
