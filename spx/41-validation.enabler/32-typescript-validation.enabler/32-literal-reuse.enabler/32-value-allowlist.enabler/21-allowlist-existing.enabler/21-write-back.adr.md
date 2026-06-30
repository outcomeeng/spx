# Allowlist Write-Back

The `spx validation literal --allowlist-existing` helper persists allowlist entries to the active `spx.config.*` file detected by the config module, preserves that file's syntax format and unrelated sections through config-owned parse and serialize APIs, and writes the result atomically through injected reader and writer dependencies. When no `spx.config.*` exists, the helper creates `spx.config.yaml`.

## Rationale

A bulk-silence helper writes the product's main configuration file, so the write path must match the read path and remain crash-safe. Reusing config-module detection gives the helper one source of truth for the target file and makes ambiguity handling identical to normal config resolution. Round-tripping through `src/config/` preserves the selected config syntax without downstream JSON, YAML, or TOML parsing logic.

Atomic replacement prevents a concurrent reader, power loss, or process termination from observing a partial config file. The production writer routes through `spx/21-infrastructure.enabler/11-atomic-file-write.enabler/21-atomic-file-write.adr.md`, so the temp file is a random-suffixed sibling of the destination and the final `rename` stays on the destination filesystem. Reader and writer dependency injection keeps the helper verifiable with real temp directories and controlled boundary implementations rather than module replacement.

## Invariants

- For every successful run against a non-empty findings set, the post-write file parses cleanly through config resolution and yields a literal config whose `include` set equals the union of the pre-write set and the newly added values.
- For every successful run, the post-write file's syntax format equals the pre-read file's syntax format, or YAML when no pre-read file exists.
- For every interrupted run between temporary write and rename, the destination file's contents equal the pre-run state.
- For every consecutive pair of runs against unchanged source, the post-second-run file's `include` set equals the post-first-run set.

## Verification

### Testing

- ALWAYS: the helper appends every distinct current literal-reuse finding value to `validation.literal.values.include`, deduplicating against existing entries and preserving existing entries ([compliance])
- ALWAYS: the helper writes only `validation.literal.values.include`, preserving file format and remaining idempotent across repeated unchanged runs ([compliance])

### Audit

- ALWAYS: the write target equals the file detected by the config module for `productDir`; when config detection returns ambiguity, the helper exits non-zero with the same error and writes nothing ([audit])
- ALWAYS: format-preserving parsing and serialization route through `src/config/`; the helper never imports raw JSON, YAML, or TOML parsers ([audit])
- ALWAYS: production writes route through the shared atomic file-write primitive, so readers observe the old file or the new file, never a partial state ([audit])
- ALWAYS: the helper's options accept optional reader and writer dependencies; supplied dependencies replace production detection and writing for `l1` evidence ([audit])
- NEVER: write directly to `spx.config.*` without atomic replacement ([audit])
- NEVER: translate the file's format on write ([audit])
- NEVER: re-implement product-directory config-file detection inside the helper ([audit])
- NEVER: replace helper filesystem boundaries through framework-level module replacement; tests inject real reader and writer adapters over temp directories ([audit])
- NEVER: cast the resolved-config result to `any` to bypass the typed return shape from config resolution ([audit])
