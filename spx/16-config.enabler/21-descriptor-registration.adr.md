# Descriptor Registration Architecture

## Purpose

This decision governs how configurable behavior across the spx harness is declared, resolved, and consumed. The enabler's assertions enforce the resulting behavior; this ADR explains the architectural "why" behind registration, single-source resolution, and per-descriptor validation.

## Context

**Business impact:** Every spx domain has configurable knobs — spec-tree hierarchy levels, decision kinds, session paths, validation rules, language markers, CLI defaults. Without a coordinated pattern, each domain parses its own yaml, hardcodes its own vocabulary, and drifts from other domains. A central config module that composes domain-declared descriptors yields a single source of truth (one yaml file), a uniform consumer API (typed resolved config), and a natural extension point (new domains register descriptors without editing existing code or the config module's schema).

**Technical constraints:** spx is TypeScript ESM, no runtime reflection. Descriptors are static: declared by each domain at compile time and imported explicitly by the config registry. Root resolution follows `15-worktree-resolution.pdr.md` — `git rev-parse --show-toplevel` for tracked-file reads. The config module depends on `src/git/` for root resolution and on the static list of imported descriptor modules for composition.

## Decision

Each spx domain declares a typed configuration descriptor — a module at `src/<domain>/config.ts` exporting an object implementing `ConfigDescriptor<T>` with fields `{ section: string, defaults: T, validate(value: unknown): Result<T> }`. The config module at `src/config/` imports each descriptor through an explicit static registry (`src/config/registry.ts`), loads the single repo-root `spx.config.yaml` (if present), merges each descriptor's yaml section with its declared defaults, runs the descriptor's own validator on the merged value, and returns a typed `Config` keyed by descriptor section. Consumers read their domain's resolved section through a typed accessor — they never touch yaml, nor reference vocabulary (suffixes, kinds, paths, rule names) outside their own descriptor. The spec-tree descriptor is the sole owner of entry-kind vocabulary; other descriptors consume spec-tree's resolved section for any vocabulary they need.

## Rationale

Descriptor-based registration is a direct application of the language-registration pattern from `19-language-registration.adr.md` to configuration. Each domain owns its own shape — what it expects, how it validates, what defaults it supplies. Adding a new configurable concern requires one descriptor module and one registry entry. Removing a concern requires deleting the descriptor and removing the registry entry. No code outside those two places changes.

Single-source resolution (repo-root yaml or defaults only) eliminates the entire class of "which config won?" questions. Layered overlays, flag-based paths, and upward discovery save a few keystrokes at the cost of non-determinism during development and opacity during debugging. A single yaml at a known location is the simplest model that still supports project-level customization.

Per-descriptor validation keeps each domain's rules isolated from every other. Cross-cutting constraints (e.g., "no suffix collisions across node kinds") belong with the vocabulary owner — the spec-tree descriptor owns all entry-kind vocabulary, so collision-checking for suffixes lives in the spec-tree descriptor's validator. Other domains that need entry-kind vocabulary consume spec-tree's resolved config; they never redeclare it.

Alternatives considered:

- **Static top-level keys baked into the config module.** Rejected because every new configurable concern would require editing the config module's schema. The module would accumulate knowledge of every domain and become the bottleneck for any change.
- **Per-domain yaml files.** Rejected because it fragments the configuration surface (developers must know which yaml lives where) and breaks the single-source promise. Cross-domain coordination becomes harder, not easier.
- **Resolution chain with cwd discovery + `--config` flag + overlay merge.** Rejected because the added flexibility saves a few keystrokes at the cost of reasoning clarity — a developer staring at unexpected behavior must walk four hypotheses instead of one.
- **Cross-domain validation registered separately.** Rejected because it forces an intermediate "whose validator owns this rule?" question. The single-owner principle (spec-tree owns entry-kind vocabulary; other domains consume) avoids the class of cross-domain collisions that such rules would address.
- **Dynamic filesystem discovery of descriptors.** Rejected consistent with `19-language-registration.adr.md` — explicit static imports give compile-time enumeration and type composition; runtime discovery breaks with bundlers and produces silent failures.

## Trade-offs accepted

| Trade-off                                                            | Mitigation / reasoning                                                                                                                   |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Each configurable domain adds a descriptor module                    | The descriptor is small (shape + defaults + validator); net volume drops versus inline yaml-parsing across consumers                     |
| No cwd override, no `--config` flag, no overlay                      | Experimental or per-directory config uses a branch or a dedicated overlay tool — not built into resolution                               |
| Cross-domain vocabulary collisions rely on single-owner discipline   | The spec-tree descriptor is the documented sole owner of entry-kind vocabulary; harness-driven coherence tests iterate the live registry |
| Config module contains an explicit import of every registered domain | The explicit-import cost buys compile-time enumeration, type composition, and bundler-safety                                             |

## Invariants

- The registry is a static array of imported descriptor modules — no runtime filesystem scan, no plugin loader
- Each descriptor's validator receives only its own yaml section — never the raw yaml nor another descriptor's section
- `resolveConfig(projectRoot)` returns a fully-typed `Config` or an error describing which descriptors' validators rejected their sections — never a partial or untyped result
- Adding a new descriptor module plus a registry entry requires no changes to any existing descriptor module or any consumer outside the new domain

## Compliance

### Recognized by

Files under `src/config/` contain the registry, loader, shared types, and the `resolveConfig` entry point. Files at `src/<domain>/config.ts` (one per domain with configurable behavior) export descriptor objects. No yaml-parsing code, suffix arrays, or kind-name literals appear outside descriptor modules.

### MUST

- Each configurable domain exports a descriptor from `src/<domain>/config.ts` implementing the `ConfigDescriptor<T>` interface ([review])
- The registry at `src/config/registry.ts` imports each descriptor with a static import statement ([review])
- Validators receive only their descriptor's yaml section; cross-cutting vocabulary rules live with the vocabulary owner, not with the config module or with consuming domains ([review])
- `resolveConfig(projectRoot: string)` accepts `projectRoot` as its first parameter — callers pass in the resolved root per `15-worktree-resolution.pdr.md` ([review])
- Tests for the config module and every registered descriptor construct fixtures programmatically through the shared spec-tree harness — directory trees and yaml content are generated, never hand-written ([review])

### NEVER

- Parse `spx.config.yaml` or reference its keys anywhere outside `src/config/` and descriptor modules ([review])
- Import one descriptor from another descriptor — descriptors are isolated by design ([review])
- Accept a `--config` flag, walk parent directories searching for yaml, or overlay multiple yaml sources — resolution reads repo-root yaml and defaults only ([review])
- Return a partial or untyped config when any descriptor's validator rejects its section ([review])
- `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism for `node:fs` / `node:fs/promises` — tests construct real fixtures through the shared harness under temp directories ([review])
- Hardcode configurable vocabulary (suffixes, kind names, rule identifiers, path literals) anywhere except inside descriptor declarations — the spec-tree descriptor is the sole owner of entry-kind vocabulary ([review])
