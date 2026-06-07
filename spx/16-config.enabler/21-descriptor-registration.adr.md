# Descriptor Registration Architecture

Each spx domain declares a typed configuration descriptor — an object implementing `ConfigDescriptor<T>` with `{ section, defaults, validate(value): Result<T> }`, exported from `src/<domain>/config.ts` (or `src/<domain>/config/descriptor.ts` when the domain has two or more config-package companion modules) — and the config module at `src/config/` imports each descriptor through a static registry (`src/config/registry.ts`), loads the single product-directory `spx.config.*` file, merges each section with its descriptor's declared defaults, runs the descriptor's own validator, and returns a typed `Config` keyed by section or an error. Repeated structural shapes are declared once as shared config primitives that validate structure only, and descriptor-section digests serialize through config-owned canonical descriptor JSON — recursively sorted object keys, preserved array order, `JSON.stringify` primitive semantics, no insignificant whitespace, hashed over the UTF-8 bytes.

## Rationale

Descriptor-based registration applies the language-registration pattern of `spx/19-language-registration.adr.md` to configuration: each domain owns its own shape, and adding or removing a configurable concern is one descriptor module plus one registry entry, with no other code touched. Single-source resolution — the product-directory config file or defaults only — eliminates the entire "which config won?" class of questions that layered overlays, flag-based paths, and upward discovery introduce; a single file at a known location is the simplest model that still supports product-level customization. Per-descriptor validation isolates each domain's rules; cross-cutting vocabulary rules live with the vocabulary owner — the spec-tree descriptor is the sole owner of entry-kind vocabulary, and other domains consume its resolved section rather than redeclaring it. Shared primitives reduce duplicated validators without merging policy: a primitive proves "this is a path filter" while the importing descriptor decides what that filter means. Descriptor placement follows a measurable companion-module rule (flat for at most one companion module, nested for two or more) so placement is deterministic rather than a matter of taste.

Rejected: static top-level keys baked into the config module (every new concern edits the module's schema, making it the bottleneck); per-domain config files (fragments the surface and breaks the single-source promise); a resolution chain with cwd discovery, a `--config` flag, and overlay merge (the flexibility saves keystrokes at the cost of reasoning clarity); separately-registered cross-domain validation (forces a "whose validator owns this?" question that single-owner discipline avoids); and dynamic filesystem discovery of descriptors (breaks with bundlers and fails silently, rejected consistently with `spx/19-language-registration.adr.md`).

## Invariants

- The registry is a static array of imported descriptor modules — no runtime filesystem scan, no plugin loader.
- Each descriptor's validator receives only its own parsed section — never raw file content nor another descriptor's section.
- `resolveConfig(productDir)` returns a fully-typed `Config` or an error describing which descriptors' validators rejected their sections — never a partial or untyped result.
- Adding a new descriptor module plus a registry entry requires no changes to any existing descriptor module or any consumer outside the new domain.
- Shared config primitives validate reusable structure only; they do not assign domain semantics outside the descriptor that imports them.
- Descriptor placement is deterministic: descriptors with at most one companion module use `src/<domain>/config.ts`; descriptors with two or more companion modules use `src/<domain>/config/descriptor.ts`.
- Descriptor moves from flat to nested placement use `git mv` and update every import in the same change.
- Descriptor-section digests use canonical descriptor JSON so logically equivalent resolved sections produce identical digest bytes.

## Verification

### Audit

- ALWAYS: each configurable domain exports a descriptor from `src/<domain>/config.ts` or `src/<domain>/config/descriptor.ts` implementing the `ConfigDescriptor<T>` interface ([audit])
- ALWAYS: the registry at `src/config/registry.ts` imports each descriptor with a static import statement ([audit])
- ALWAYS: descriptor module placement follows the companion-module rule — flat for descriptors with at most one companion module, nested for descriptors with two or more ([audit])
- ALWAYS: move descriptor modules with `git mv` when the companion-module rule changes placement, and update all registry and consumer imports in the same commit ([audit])
- ALWAYS: validators receive only their descriptor's parsed section; cross-cutting vocabulary rules live with the vocabulary owner, not with the config module or consuming domains ([audit])
- ALWAYS: repeated structural config shapes are factored into shared config primitives and imported by descriptors; domains do not copy-paste validators for the same shape ([audit])
- ALWAYS: descriptor-section digest inputs use canonical descriptor JSON — recursively sorted object keys, preserved array order, `JSON.stringify` primitive semantics, no insignificant whitespace, and UTF-8 bytes ([audit])
- ALWAYS: descriptor validators reject non-JSON-representable values before digest computation — `undefined`, `NaN`, `Infinity`, functions, symbols, and any other value outside JSON primitives, arrays, and objects ([audit])
- ALWAYS: `resolveConfig(productDir: string)` accepts `productDir` as its first parameter — callers pass in the resolved product directory per `spx/15-worktree-resolution.pdr.md` ([audit])
- ALWAYS: tests for the config module and every registered descriptor construct fixtures programmatically through the shared spec-tree harness — directory trees and config content are generated, never hand-written ([audit])
- NEVER: parse raw `spx.config.*` content or reference config-file keys anywhere outside `src/config/` and descriptor modules ([audit])
- NEVER: import one descriptor from another descriptor — descriptors are isolated by design ([audit])
- NEVER: put domain policy defaults in shared config primitives — primitives validate reusable structure; descriptors own meaning and defaults ([audit])
- NEVER: accept a `--config` flag, walk parent directories searching for config files, or overlay multiple config sources — resolution reads the product-directory config file and defaults only ([audit])
- NEVER: return a partial or untyped config when any descriptor's validator rejects its section ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism for `node:fs` / `node:fs/promises` — tests construct real fixtures through the shared harness under temp directories ([audit])
- NEVER: hardcode configurable vocabulary (suffixes, kind names, rule identifiers, path literals) anywhere except inside descriptor declarations — the spec-tree descriptor is the sole owner of entry-kind vocabulary ([audit])
