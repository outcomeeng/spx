# Config File Formats

## Purpose

This decision governs which file formats `spx.config.*` accepts at the project root, how the config loader resolves which file to read when the project supplies one, and what happens when the project supplies more than one.

## Context

**Business impact:** spx is a multi-language tool. Projects using it may be primarily TypeScript, Python, Rust, or a mix. Each language ecosystem has a preferred config format — JSON with schema validation for TypeScript/JavaScript projects, YAML for configuration-heavy toolchains, TOML for Rust and Python projects. Restricting spx to a single format forces teams to maintain a file in a format foreign to their stack. Supporting the three canonical formats lets each project use the format their tooling already understands.

**Technical constraints:** JSON Schema validators and IDE tooling (VS Code, JetBrains) recognize `spx.config.json` natively when the file is associated with a published schema. YAML language servers support schema association via a file-level pragma. TOML has limited schema-validation tooling but is the idiomatic format for Rust (`Cargo.toml`) and Python (`pyproject.toml`) projects. All three formats are structurally equivalent for the key-value shapes spx config requires — no format-specific features are needed.

## Decision

The config loader accepts `spx.config.json`, `spx.config.yaml`, and `spx.config.toml` at the project root. Exactly one of these files may be present; when more than one is present, the loader returns an error naming all detected files and does not return a config. When none is present, all descriptors resolve to their declared defaults.

## Rationale

Three formats, no priority order, error on ambiguity is the strictest policy that allows format choice without hiding mistakes. A silent priority order (`json > yaml > toml`) lets a project accumulate stale config files without feedback — the winning file takes effect and the others are silently ignored. An error on ambiguity is the same policy tsconfig, prettierrc, and eslint.config use: the tool refuses to guess which file is authoritative.

The three formats selected cover the canonical config ecosystems without adding formats that would require special handling or non-standard parsers. XML is excluded because no modern developer toolchain uses it for project config. JavaScript/TypeScript config files (e.g., `spx.config.ts`) are excluded because they require a runtime to evaluate and produce a security surface not appropriate for a validation tool.

Alternatives considered:

- **Single format (YAML only).** Rejected because it forces JSON-first and TOML-first projects to maintain a file in a foreign format with no benefit to those projects.
- **Silent priority order (JSON > YAML > TOML).** Rejected because it silently ignores all but the highest-priority file when multiple are present, hiding stale or conflicting config without any diagnostic.
- **Accept any format with runtime detection.** Rejected because it grows the parser surface without a corresponding benefit — the three canonical formats cover every project type spx targets.

## Trade-offs accepted

| Trade-off                                                                             | Mitigation / reasoning                                                                                          |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| TOML support adds a parsing dependency                                                | TOML is small and well-specified; the dependency is isolated to `src/config/`                                   |
| Error on ambiguity is a breaking change for projects that accidentally have two files | The error message names both files and the fix is a one-line deletion; the alternative (silent ignore) is worse |
| No `spx.config.ts` support                                                            | TypeScript config files require a runtime evaluator; the complexity and security surface exceed the convenience |

## Invariants

- The project root contains at most one `spx.config.*` file at any time. Presence of two or more is an error, not a resolution problem.

## Compliance

### Recognized by

Format detection is encapsulated within the config module — no caller outside performs format probing. The config module probes for all three supported filenames on each load and errors on ambiguity before delegating to a format-specific parser.

### MUST

- Probe for all three filenames (`spx.config.json`, `spx.config.yaml`, `spx.config.toml`) on every config load — absence of two is not assumed ([review])
- Return an error naming every detected file when more than one is present — do not silently pick a winner ([review])
- Delegate YAML, JSON, and TOML parsing to a single parse site within `src/config/` — no caller outside that module handles raw file content ([review])

### NEVER

- Apply a silent priority order when multiple config files are present — ambiguity is always an error ([review])
- Accept `spx.config.js`, `spx.config.ts`, or any executable config format — config files are data, not code ([review])
- Search parent directories for a config file — resolution reads the project root only, per `21-descriptor-registration.adr.md` ([review])
