# Plan: Config-Backed Execution Scope

> **Reconcile against `spx/PLAN.md` first.** The corrected model separates `persistence` (records / journals / snapshots) from `backend` (was "materialization") and `delivery`, makes verification the five types, requires additive migration (never a wholesale move), and defers `.surface`. This config library's CLI wrapper moves to the surface layer. Where this note predates that model, the root plan governs.

## Harness vocabulary guard

Before applying a harness-environment or agent-facing packet from this plan, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, agent, agent adapter, and agent session. Treat nearby `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; every touched spec, command text, source name, test, and pickup prompt names the precise harness role it describes.

## Purpose

Coordinate the refactor tranche that moves deterministic execution domains onto the shared config descriptor system: `validation`, `testing`, harness environment management, context ingestion, and future execution domains.

## Governing Decisions

- `spx/16-config.enabler/21-descriptor-registration.adr.md` owns the generic descriptor mechanism, shared config primitives, and registry composition.
- `spx/16-config.enabler/21-config-file-formats.adr.md` owns `spx.config.{json,yaml,toml}` format resolution.
- `spx/15-worktree-management.pdr.md` owns whether a domain resolves tracked product files from the local worktree root or gitignored state from the Git common-dir product root.

## Settled foundations

- `spx/16-config.enabler/32-shared-config-primitives.enabler/` owns the shared path-filter primitive.
- `spx/16-config.enabler/43-domain-execution-descriptors.enabler/` owns the registered testing descriptor extension.
- `spx/16-config.enabler/54-canonical-descriptor-digest.enabler/` owns canonical descriptor JSON and digest computation.
- `spx/16-config.enabler/65-product-directory-api.enabler/` owns product-directory API vocabulary for config-owned root resolution.
- `spx/33-harness-environment.enabler/` owns the harness environment descriptor shape consumed by agent config and future harness-environment packets.

## Active tranche

1. Complete test status evidence.
   - Work in `spx/41-test.enabler/43-last-run-evidence.enabler/`.
   - Consume the settled testing descriptor, domain execution descriptor, canonical descriptor digest, and product-directory API.

2. Complete file-inclusion path-scope migration.
   - Work in `spx/17-file-inclusion.enabler/65-domain-path-filters.enabler/`.
   - Consume the settled path-filter primitive.
   - Final ignore-source deletion follows test passing-scope integration.

3. Complete agent instruction and plugin bootstrap packets.
   - Work in `spx/33-harness-environment.enabler/21-agent-instructions.enabler/` and `spx/33-harness-environment.enabler/43-plugin-bootstrap.enabler/`.
   - Consume settled agent descriptor and agent config reconciliation.

## Refactor Tranche Agent Work Packets

Each packet is intended for one agent on one branch. Agents start from fresh `origin/main`, load the target node through `spec-tree:contextualize`, follow the node-local `PLAN.md`, open one focused PR, and handle PR review until merge or until blocked by a repository-governed decision.

Settled prerequisites on current `origin/main`:

This list reflects expected state. Agents verify these at branch time, and dispatchers use the commands below to confirm current state before packet assignment.

- Shared path-filter primitive: `spx/16-config.enabler/32-shared-config-primitives.enabler/` owns the structural `{ include?: string[]; exclude?: string[] }` primitive. Dependent packets consume it and do not recreate path-filter validators.
- Testing descriptor: `spx/41-test.enabler/32-test-config.enabler/` and `spx/16-config.enabler/43-domain-execution-descriptors.enabler/` own the registered testing descriptor. Dependent packets consume it and do not create a second testing descriptor.
- Spec-domain public surface: `spx/31-spec-domain.enabler/spec-domain.md` and `spx/23-spec-tree.enabler/spec-tree.md` own the settled command and library surfaces S1 consumes.
- F1 consumes the settled path-filter primitive directly.

## Dispatcher Verification

Verify the settled prerequisites before assigning dependent packets:

```bash
git cat-file -e origin/main:spx/16-config.enabler/32-shared-config-primitives.enabler/shared-config-primitives.md
git cat-file -e origin/main:spx/41-test.enabler/32-test-config.enabler/test-config.md
git cat-file -e origin/main:spx/16-config.enabler/43-domain-execution-descriptors.enabler/domain-execution-descriptors.md
git cat-file -e origin/main:spx/31-spec-domain.enabler/spec-domain.md
git cat-file -e origin/main:spx/23-spec-tree.enabler/spec-tree.md
```

Dispatcher Verification covers already-settled prerequisites only. Packet outputs such as C1 and C2 are checked by dependent agents at branch time, so dispatchers may assign dependent packets while those prerequisites are in flight when they expect the agents to self-block until the sentinel exists.

| Packet | Target node                                                         | Depends on                                                                                  | Output                                                                                                              |
| ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| C1     | `spx/16-config.enabler/54-canonical-descriptor-digest.enabler/`     | none                                                                                        | Settled on `origin/main`: config-owned canonical descriptor JSON and descriptor digest API                          |
| C2     | `spx/16-config.enabler/65-product-directory-api.enabler/`           | none; dispatcher-enforced preference to sequence after C1 because both touch config modules | Settled on `origin/main`: product-root vocabulary across config APIs, harnesses, and root helpers                   |
| F1     | `spx/17-file-inclusion.enabler/65-domain-path-filters.enabler/`     | settled path-filter primitive                                                               | File-inclusion resolver accepts descriptor-owned domain path filters                                                |
| T1     | `spx/22-test-environment.enabler/32-spec-tree-fixtures.enabler/`    | C2                                                                                          | Remaining spec-tree tests use `withSpecTreeEnv` when they need materialized `spx/` fixtures                         |
| T2     | `spx/41-test.enabler/43-last-run-evidence.enabler/`                 | settled test config, settled domain execution descriptor, C1, C2                            | Persisted test observations and stale-status inputs                                                                 |
| S1     | `spx/31-spec-domain.enabler/43-context-ingestion.enabler/`          | settled public-surface files on `origin/main`; S1 verifies surface completeness             | Deterministic context-ingestion command surface                                                                     |
| E0     | `spx/33-harness-environment.enabler/`                               | none; critical-path priority before E2                                                      | Settled on `origin/main`: harness environment descriptor shape for instructions, agent config, and plugin bootstrap |
| E1     | `spx/33-harness-environment.enabler/21-agent-instructions.enabler/` | E0, E2; E0 is direct and also implied by E2                                                 | Assign after E2 merges: deterministic instruction-file reconciliation; sentinel `agent-instructions.md`             |
| E2     | `spx/33-harness-environment.enabler/32-agent-config.enabler/`       | E0                                                                                          | Settled on `origin/main`: Claude Code and Codex agent config reconciliation                                         |
| E3     | `spx/33-harness-environment.enabler/43-plugin-bootstrap.enabler/`   | E2                                                                                          | Plugin marketplace, plugin, and skill bootstrap status                                                              |

Critical path: E0 must settle before E2, and E2 gates E1 and E3 transitively. Assign E0 and E2 early when harness-environment packets are planned. C1 and C2 can start independently, but both may touch `src/config/`, `testing/generators/config/`, and config descriptor tests; the C1-before-C2 preference is dispatcher-enforced rather than agent-enforced. If C1 and C2 run in parallel, merge one first, then rebase the other and rerun validation before review.

## Common Agent Pickup Rules

Use this prompt skeleton for every packet, replacing `{target-node}` and `{packet-slug}` with the descriptive branch slug from the node-local prompt:

```text
Start from fresh origin/main on a branch named work/{packet-slug}. Before branching, run `git ls-remote --exit-code --heads origin work/{packet-slug}`; if the branch already exists, stop and inspect the existing PR or branch before claiming the packet. Fetch origin main and verify every settled prerequisite sentinel file named by this PLAN exists on origin/main with `git cat-file -e origin/main:<path>`; this command must exit 0 for each sentinel. Directory existence alone is not a settled-prerequisite check. If a prerequisite is absent, stop and record the gap in the owning PLAN.md before implementation. Invoke spec-tree:understand if the foundation marker is absent, then invoke spec-tree:contextualize for {target-node}. Read {target-node}/PLAN.md and every governing spec or decision named there. Then invoke spec-tree:apply before implementation, the relevant language architecture/testing/coding skills before changing tests or code, and spec-tree:commit-changes plus spec-tree:merge before publishing the branch.

The output sentinel file for each packet must strip the numeric prefix and `.enabler` suffix from the node directory slug, then add `.md`; for example, `54-canonical-descriptor-digest.enabler` produces `canonical-descriptor-digest.md`. A node-local PLAN may name a different sentinel path only when the target artifact is intentionally elsewhere.

Fallback: If the runtime cannot load `spec-tree:merge`, record the missing skill once in `spx/16-config.enabler/ISSUES.md`, then proceed using the product PR audit workflow in the top-level `CLAUDE.md` under "Pull request (PR) audit workflow" and "Executing PR workflow". `AGENTS.md`, if configured as a symlink to `CLAUDE.md`, provides the same product instructions.

Ownership and review loop:
1. Own only {target-node} and the implementation files required by its assertions.
2. Do not edit sibling packet PLAN files except to record a scope-expanding review finding in the owning PLAN.
3. If the packet touches shared helpers or cross-node harness files, add or follow an Implementation Ownership section before editing.
4. Do not use subagents for edits.
5. Keep the PR focused, ask for adversarial review of the packet's API shape, evidence coverage, and behavior preservation, wait for PR checks and comments, patch actionable findings, rerun focused `spx test {target-node}` plus `pnpm run validate`, and repeat until the PR is merged or a repository-governed decision blocks progress.
```

## Open Coordination

See packet-level PLAN files for per-node evidence items; this section records cross-packet coordination only.

- Record shared gaps discovered during implementation here before opening a shared branch.
- After config primitives land, update file-inclusion and test implementation branches to consume the shared primitive rather than duplicating path-filter validation.
- Agree on the canonical descriptor digest API shape before branches implementing test last-run evidence integrate.
- After T1-T2 settle, evaluate whether the parent `spx/41-test.enabler/` spec needs a separate parent-level test API alignment packet; create that packet only when a concrete parent-spec change is identified.
- After T1 settles, evaluate whether the parent `spx/22-test-environment.enabler/` spec needs a separate parent-level fixture-harness alignment packet; create that packet only when a concrete parent-spec change is identified.
- After F1 and T2 settle, inspect F1's PLAN for ignore-source deletion candidates and create a follow-up packet only when a concrete production deletion remains.
- After F1 settles, evaluate whether the parent `spx/17-file-inclusion.enabler/` spec needs a separate parent-level file-inclusion API alignment packet; create that packet only when a concrete parent-spec change is identified.
- After C1 or C2 merges, evaluate whether common pickup rules should move from this config tranche PLAN to a neutral coordination artifact before assigning cross-domain packets such as E0 or S1.
- `spx/41-test.enabler/21-python-test.enabler/` and `spx/41-test.enabler/21-typescript-test.enabler/` are current language-skill specs, not implementation packets for this config/status tranche.

## Evidence Required

- Config primitive tests cover valid/invalid include and exclude arrays, missing fields, empty config, and error paths.
- Registry-extension tests prove testing descriptors compose without changing existing descriptor modules.
- Config-format mapping tests cover the new sections across JSON, YAML, and TOML.
- Descriptor isolation tests prove a malformed `testing` section cannot read or change validation config.
- Shared-primitive tests prove validation and testing descriptors import the same path-filter primitive while exposing policy under separate sections.
- Registry-extension tests prove the shared-primitive scenario from `config.md`: two domain descriptors import one shared path-filter primitive and expose it under separate domain sections without sharing policy defaults.
- Canonical descriptor JSON tests prove object keys sort recursively, array order is preserved, primitive serialization matches JSON semantics, and digest input bytes are stable across equivalent resolved descriptor sections.
- Canonical descriptor JSON tests prove validators reject `undefined`, `NaN`, `Infinity`, functions, symbols, and other non-JSON-representable values before digest computation.
- Canonical descriptor JSON digest implementation uses Node.js `node:crypto`; no third-party crypto dependency is introduced.
