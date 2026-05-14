# Plan: Config-Backed Execution Scope

## Purpose

Coordinate the config tranche that moves deterministic execution domains onto the shared config descriptor system: validation, testing, auditing, reviewing, and future execution domains.

## Governing Decisions

- `spx/16-config.enabler/21-descriptor-registration.adr.md` owns the generic descriptor mechanism, shared config primitives, and registry composition.
- `spx/16-config.enabler/21-config-file-formats.adr.md` owns `spx.config.{json,yaml,toml}` format resolution.
- `spx/15-worktree-resolution.pdr.md` owns whether a domain resolves tracked product files from the local worktree or gitignored state from the main repository root.

## Current Tranche

1. Add shared config primitives for repeated descriptor shapes.
   - Work in `spx/16-config.enabler/32-shared-config-primitives.enabler/`.
   - Start with a path filter primitive: `{ include?: string[]; exclude?: string[] }`.
   - Keep the primitive structural only; domain descriptors own defaults and meaning.
   - Move validation path-filter validation to the shared primitive without changing `validation.paths` behavior.

2. Add a testing descriptor.
   - Work in `spx/41-testing.enabler/32-testing-config.enabler/` and consume through `spx/16-config.enabler/43-domain-execution-descriptors.enabler/`.
   - Section owns passing-scope configuration only.
   - The descriptor uses the shared path filter primitive for node/path selection.
   - `spx test` still runs normal test discovery; only `spx test passing` and status semantics consume passing-scope filters.

3. Add audit and review descriptor nodes.
   - Work in `spx/36-audit.enabler/43-audit-config.enabler/` and `spx/46-reviewing.enabler/21-review-config.enabler/`.
   - Audit owns storage defaults, branch slug settings, auditor selection, and target selection.
   - Review owns local hermetic execution defaults for branch and PR targets.

4. Rename config root APIs from `projectRoot` to `productDir`.
   - Work in `spx/16-config.enabler/65-product-directory-api.enabler/`.
   - Apply to config APIs, tests, harness helpers, and spec text in one coherent pass.
   - Do not leave compatibility aliases.
   - Include root-resolution helper names such as `detectMainRepoRoot` in the rename audit.
   - Treat existing runtime `projectRoot` names as pre-tranche debt; do not add new `projectRoot` call sites while this tranche is active.

5. Add canonical descriptor digests.
   - Work in `spx/16-config.enabler/54-canonical-descriptor-digest.enabler/`.
   - Provide config-owned canonical descriptor JSON and SHA-256 digest computation for testing, audit, and review state.

## Evidence Required

- Config primitive tests cover valid/invalid include and exclude arrays, missing fields, empty config, and error paths.
- Registry-extension tests prove testing, audit, and review descriptors compose without changing existing descriptor modules.
- Config-format mapping tests cover the new sections across JSON, YAML, and TOML.
- Descriptor isolation tests prove a malformed testing, audit, or review section cannot read or change validation config.
- Shared-primitive tests prove validation and testing descriptors import the same path-filter primitive while exposing policy under separate sections.
- Registry-extension tests prove the shared-primitive scenario from `config.md`: two domain descriptors import one shared path-filter primitive and expose it under separate domain sections without sharing policy defaults.
- Canonical descriptor JSON tests prove object keys sort recursively, array order is preserved, primitive serialization matches JSON semantics, and digest input bytes are stable across equivalent resolved descriptor sections.
- Canonical descriptor JSON tests prove validators reject `undefined`, `NaN`, `Infinity`, functions, symbols, and other non-JSON-representable values before digest computation.
- Canonical descriptor JSON digest implementation uses Node.js `node:crypto`; no third-party crypto dependency is introduced.

## Open Coordination

- After config primitives land, update file-inclusion, testing, audit, and review implementation branches to consume the shared primitive rather than duplicating path-filter validation.
