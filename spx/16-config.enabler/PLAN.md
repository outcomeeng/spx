# Plan: Config-Backed Execution Scope

## Purpose

Coordinate the config tranche that moves deterministic execution domains onto the shared config descriptor system: validation, testing, auditing, reviewing, and future execution domains.

## Governing Decisions

- `spx/16-config.enabler/21-descriptor-registration.adr.md` owns the generic descriptor mechanism, shared config primitives, and registry composition.
- `spx/16-config.enabler/21-config-file-formats.adr.md` owns `spx.config.{json,yaml,toml}` format resolution.
- `spx/15-worktree-resolution.pdr.md` owns whether a domain resolves tracked product files from the local worktree root or gitignored state from the Git common-dir product root.

## Current Tranche

1. Add shared config primitives for repeated descriptor shapes.
   - Work in `spx/16-config.enabler/32-shared-config-primitives.enabler/`.
   - Start with a path filter primitive: `{ include?: string[]; exclude?: string[] }`.
   - Keep the primitive structural only; domain descriptors own defaults and meaning.
   - Reuse validation's path-filter validation through the shared primitive without changing `validation.paths` behavior.

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
   - Rename root-resolution helper names with ambiguous vocabulary, such as `detectMainRepoRoot`, to Git common-dir product-root vocabulary.
   - Treat existing runtime `projectRoot` names as pre-tranche debt; do not add new `projectRoot` call sites while this tranche is active.

5. Add canonical descriptor digests.
   - Work in `spx/16-config.enabler/54-canonical-descriptor-digest.enabler/`.
   - Provide config-owned canonical descriptor JSON and SHA-256 digest computation for testing, audit, and review state.

## Agent Work Packets

Each packet is intended for one agent on one branch. Agents start from fresh `origin/main`, load the target node through `spec-tree:contextualizing`, follow the node-local `PLAN.md`, open one focused PR, and handle PR review until merge or until blocked by a repository-governed decision.

Settled prerequisites on current `origin/main`:

- Shared path-filter primitive: `spx/16-config.enabler/32-shared-config-primitives.enabler/` owns the structural `{ include?: string[]; exclude?: string[] }` primitive. Dependent packets consume it and do not recreate path-filter validators.
- Testing descriptor: `spx/41-testing.enabler/32-testing-config.enabler/` and `spx/16-config.enabler/43-domain-execution-descriptors.enabler/` own the registered testing descriptor. Dependent packets consume it and do not create a second testing descriptor.

| Packet | Target node | Depends on | Output |
| --- | --- | --- | --- |
| C1 | `spx/16-config.enabler/54-canonical-descriptor-digest.enabler/` | none | Config-owned canonical descriptor JSON and descriptor digest API |
| C2 | `spx/16-config.enabler/65-product-directory-api.enabler/` | none | Product-root vocabulary across config APIs, harnesses, and root helpers |
| C3 | `spx/17-file-inclusion.enabler/65-domain-path-filters.enabler/` | settled path-filter primitive | File-inclusion resolver accepts descriptor-owned domain path filters |
| T1 | `spx/22-test-environment.enabler/32-spec-tree-fixtures.enabler/` | none | Remaining spec-tree tests use `withSpecTreeEnv` when they need materialized `spx/` fixtures |
| T2 | `spx/41-testing.enabler/43-last-run-evidence.enabler/` | settled testing descriptor, C1 | Persisted test observations and stale-status inputs |
| A1 | `spx/36-audit.enabler/43-audit-config.enabler/` | settled path-filter primitive | Registered audit config descriptor |
| A2 | `spx/36-audit.enabler/54-branch-run-state.enabler/` | A1, C1 | Branch-scoped audit run state under `.spx/audit/{branch-slug}` |
| A3 | `spx/36-audit.enabler/65-auditor-execution.enabler/` | A1, A2, E2 | Configured auditor execution with isolated state |
| A4 | `spx/36-audit.enabler/87-audit-status.enabler/` | A2 | Audit list/status/latest reporting from persisted state |
| R1 | `spx/46-reviewing.enabler/21-review-config.enabler/` | settled path-filter primitive | Registered review config descriptor |
| R2 | `spx/46-reviewing.enabler/32-hermetic-review-execution.enabler/` | R1, E2 | Isolated reviewer execution substrate |
| R3 | `spx/46-reviewing.enabler/43-review-state.enabler/` | R1, C1 | Persisted review observations and latest-review lookup |
| R4 | `spx/46-reviewing.enabler/54-branch-review.enabler/` | R2, R3 | `spx review branch` target execution |
| R5 | `spx/46-reviewing.enabler/65-pr-review.enabler/` | R2, R3 | `spx review pr <number>` target execution |
| S1 | `spx/31-spec-domain.enabler/43-context-ingestion.enabler/` | `origin/main` containing `baf0a21` and `0aec521` | Deterministic context-ingestion command surface |
| E0 | `spx/33-agent-environment.enabler/` | none | Agent environment descriptor shape for instructions, runtime config, and plugin bootstrap |
| E1 | `spx/33-agent-environment.enabler/21-agent-instructions.enabler/` | E0 | Deterministic instruction-file reconciliation |
| E2 | `spx/33-agent-environment.enabler/32-runtime-config.enabler/` | E0 | Claude Code and Codex runtime config reconciliation |
| E3 | `spx/33-agent-environment.enabler/43-plugin-bootstrap.enabler/` | E2 | Plugin marketplace, plugin, and skill bootstrap status |

## Common Agent Pickup Rules

Use this prompt skeleton for every packet, replacing `{target-node}` and `{packet-slug}` with the descriptive branch slug from the node-local prompt:

```text
Start from fresh origin/main on a branch named work/{packet-slug}. Before branching, fetch origin main and verify every settled prerequisite path named by this table exists on origin/main with `git ls-tree origin/main -- <path>`. For S1, verify `git merge-base --is-ancestor baf0a21 origin/main` and `git merge-base --is-ancestor 0aec521 origin/main`. If a prerequisite is absent, stop and record the gap in the owning PLAN.md before implementation. Invoke spec-tree:understanding if the foundation marker is absent, then invoke spec-tree:contextualizing for {target-node}. Read {target-node}/PLAN.md and every governing spec or decision named there. Then invoke spec-tree:applying before implementation, the relevant language architecture/testing/coding skills before changing tests or code, and spec-tree:committing-changes plus spec-tree:opening-pr before publishing the branch. `spec-tree:opening-pr` is listed as an additional Spec Tree skill in AGENTS.md; if the runtime cannot load it, stop, record the missing skill as an imperfection, and use the product PR audit workflow in AGENTS.md under "Pull request (PR) audit workflow" and "Executing PR workflow".

Own only {target-node} and the implementation files required by its assertions. Do not edit sibling packet PLAN files except to record a scope-expanding review finding in the owning PLAN. Do not use subagents for edits. Keep the PR focused, ask for adversarial review of the packet's API shape, evidence coverage, and behavior preservation, wait for PR checks and comments, patch actionable findings, rerun focused tests plus pnpm run validate and pnpm test, and repeat until the PR is merged or a repository-governed decision blocks progress.
```

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
- Agree on the canonical descriptor digest API shape before branches implementing testing last-run evidence, audit config digest, or review config digest integrate.
