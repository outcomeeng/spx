# Plan: Config-Backed Execution Scope

## Purpose

Coordinate the config tranche that moves deterministic execution domains onto the shared config descriptor system: validation, testing, auditing, reviewing, and future execution domains.

## Governing Decisions

- `spx/16-config.enabler/21-descriptor-registration.adr.md` owns the generic descriptor mechanism, shared config primitives, and registry composition.
- `spx/16-config.enabler/21-config-file-formats.adr.md` owns `spx.config.{json,yaml,toml}` format resolution.
- `spx/15-worktree-resolution.pdr.md` owns whether a domain resolves tracked product files from the local worktree or gitignored state from the main repository root.

## Current Tranche

1. Add shared config primitives for repeated descriptor shapes.
   - Start with a path filter primitive: `{ include?: string[]; exclude?: string[] }`.
   - Keep the primitive structural only; domain descriptors own defaults and meaning.
   - Move validation path-filter validation to the shared primitive without changing `validation.paths` behavior.

2. Add a testing descriptor.
   - Section owns passing-scope configuration only.
   - The descriptor uses the shared path filter primitive for node/path selection.
   - `spx test` still runs normal test discovery; only `spx test passing` and status semantics consume passing-scope filters.

3. Add audit and review descriptor placeholders.
   - Audit owns storage defaults, branch slug settings, auditor selection, and target selection.
   - Review owns local hermetic execution defaults for branch and PR targets.
   - If review has no node yet, create it through `spec-tree:decomposing` from the product root before implementation.

4. Rename config root APIs from `projectRoot` to `productDir`.
   - Apply to config APIs, tests, harness helpers, and spec text in one coherent pass.
   - Do not leave compatibility aliases.

## Evidence Required

- Config primitive tests cover valid/invalid include and exclude arrays, missing fields, empty config, and error paths.
- Registry-extension tests prove testing, audit, and review descriptors compose without changing existing descriptor modules.
- Config-format mapping tests cover the new sections across JSON, YAML, and TOML.
- Descriptor isolation tests prove a malformed testing, audit, or review section cannot read or change validation config.
- Shared-primitive tests prove validation and testing descriptors import the same path-filter primitive while exposing policy under separate sections.

## Open Coordination

- Decide and create the review node placement with `spec-tree:decomposing` before implementing the review descriptor or local hermetic review execution.
- After config primitives land, update file-inclusion, testing, audit, and review implementation plans to consume the shared primitive rather than duplicating path-filter validation.
