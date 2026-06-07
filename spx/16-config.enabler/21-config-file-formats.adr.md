# Config File Formats

The config loader accepts `spx.config.json`, `spx.config.yaml`, and `spx.config.toml` in the product directory; exactly one may be present, more than one is an error naming every detected file (no config is returned), and none means every descriptor resolves to its declared defaults.

## Rationale

Three formats with no priority order, erroring on ambiguity, is the strictest policy that allows format choice without hiding mistakes: each product uses the format its tooling already understands (JSON with schema validation for TypeScript, YAML for configuration-heavy toolchains, TOML for Rust and Python), while a silent priority order (`json > yaml > toml`) would let stale config files accumulate unnoticed as the winning file takes effect and the others are silently ignored. Erroring on ambiguity matches `tsconfig`, `prettierrc`, and `eslint.config`: the tool refuses to guess which file is authoritative. XML is excluded because no modern product-config toolchain uses it; executable config (`spx.config.ts` / `spx.config.js`) is excluded because it requires a runtime evaluator and opens a security surface inappropriate for a validation tool.

## Invariants

- The product directory contains at most one `spx.config.*` file at any time; presence of two or more is an error, not a resolution problem.

## Verification

### Audit

- ALWAYS: probe for all three filenames (`spx.config.json`, `spx.config.yaml`, `spx.config.toml`) on every config load — absence of two is not assumed ([audit])
- ALWAYS: return an error naming every detected file when more than one is present — do not silently pick a winner ([audit])
- ALWAYS: delegate YAML, JSON, and TOML parsing to a single parse site within `src/config/` — no caller outside that module handles raw file content ([audit])
- NEVER: apply a silent priority order when multiple config files are present — ambiguity is always an error ([audit])
- NEVER: accept `spx.config.js`, `spx.config.ts`, or any executable config format — config files are data, not code ([audit])
- NEVER: search parent directories for a config file — resolution reads the product directory only, per `spx/16-config.enabler/21-descriptor-registration.adr.md` ([audit])
