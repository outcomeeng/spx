# Root coordination plan: next-methodology migration

This note coordinates SPX migration toward the next Outcome Engineering methodology structure. It is workflow memory, not product truth. Durable product truth stays in `spx/spx.product.md`, decisions, specs, tests, source, and the external Outcome Engineering methodology repository.

Machine-read facts for skills and commands belong in structured files, not Markdown. When SPX needs methodology-aware behavior, add or extend structured configuration such as `spx.config.json` or the existing `spx.config.{yaml,toml}` family; do not parse this note as an authority source.

## Authority View

| Authority source                         | Level                      | Use in this plan                                                                                                                                           |
| ---------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator direction in this session       | Binding coordination input | Defines the migration sequence, removes the invalid local methodology PDRs, and requires active/parked split rows.                                         |
| `spx/spx.product.md`                     | Product truth              | Defines SPX as the deterministic harness for Outcome Engineering agents, surfaces, verification, context ingestion, harness inputs, and durable artifacts. |
| External Outcome Engineering methodology | Methodology source         | Owns the next methodology vocabulary and node-kind model. SPX consumes it through structured context injection once SPX supports that.                     |
| Current `spx/` tree                      | Inventory                  | Shows current holding paths and catalysts. A current path proves where behavior lives now, not its final receiver.                                         |
| This `spx/PLAN.md`                       | Coordination               | Names active split work, parked work, re-entry conditions, and verification route.                                                                         |

## Target Area Projection

The target model has five top-level area roles, ordered by target dependency reach. The holding paths in the inventory column are unordered examples of current behavior locations; their current numeric indices do not define target bands or receiver order.

| Order | Area role    | Owns                                                                                        | Current holding paths to inspect as inventory                                                                                                             |
| ----- | ------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Substrate    | Runtime, process, filesystem, Git, workflow, hook, package, and external-service mechanics. | `spx/21-infrastructure.enabler`, `spx/13-cli.enabler`, parts of `spx/33-harness-environment.enabler`.                                                     |
| 2     | Capabilities | Reusable product behavior consumed by one or more domains, interfaces, or surfaces.         | `spx/16-config.enabler`, `spx/18-state.enabler`, `spx/23-spec-tree.enabler`, `spx/25-outcomeeng.enabler/31-spec-tree.enabler`, `spx/38-worktree.enabler`. |
| 3     | Domains      | Semantically composed product workflows over capabilities.                                  | `spx/34-verification.enabler`, `spx/41-test.enabler`, `spx/41-validation.enabler`, parts of `spx/31-spec-domain.enabler`.                                 |
| 4     | Interfaces   | Stable consumption contracts over domains or capabilities.                                  | Interface-neutral parts of `spx/31-spec-domain.enabler`, verification-run contracts, future API/MCP contracts.                                            |
| 5     | Surfaces     | Concrete CLI, MCP, web API, and UI interaction boundaries.                                  | `spx/60-surfaces.enabler`, CLI wrapper children currently scattered under domain nodes.                                                                   |

No new suffix is valid merely because this projection names an area role. SPX must support configured node kinds and methodology context injection before any target suffix migration begins.

## Active Migration Rows

| Current area                                                                                                          | Target receiver                                | Next edit                                                                                                                                                         | Prerequisite                                                                          | Verification                                                                            |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `spx/09-methodology-vocabulary.pdr.md`, `spx/10-methodology-node-kinds.pdr.md`, `spx/11-methodology-structure.pdr.md` | External methodology consumed by SPX           | Remove these invalid product-local methodology PDRs from SPX.                                                                                                     | External methodology work continues under `~/Code/outcomeeng/methodology-next`.       | `tsx src/cli.ts validation markdown spx/PLAN.md`, `pnpm run validate`, changes review.  |
| `spx/PLAN.md`                                                                                                         | Root coordination                              | Keep only executable migration coordination: active rows, parked rows, SPX support gaps, final migration path.                                                    | Root context loaded through `/understand`, `/contextualize spx/`, and decompose-next. | Markdown validation and PR review.                                                      |
| `spx/60-surfaces.enabler/21-cli-surface.enabler/21-journal.enabler`                                                   | Surface wrapper holding path                   | Split the journal node later so only CLI binding remains under the CLI surface. Persistence, verification-run semantics, and backend selection leave the surface. | Persistence and verification receivers named and reviewed.                            | Focused spec/audit review for the split; no wholesale move.                             |
| `spx/34-verification.enabler`, `spx/41-test.enabler`, `spx/41-validation.enabler`                                     | Verification domain                            | Project validation and test as verification types under verification; keep current paths as holding paths until SPX can represent the target structure.           | Node-kind support and methodology context injection.                                  | Spec audits plus focused `spx test` for touched nodes when behavior changes.            |
| `spx/18-state.enabler`, `spx/15-agent-run-journal.enabler`, `.spx/` stores                                            | Persistence capability                         | Define records, journals, snapshots, backend addressing, and retention as persistence capabilities. Reserve `state` for node lifecycle standing.                  | Structured methodology vocabulary available to context loading.                       | PDR/spec audit for persistence decisions; focused tests when storage code changes.      |
| `spx/31-spec-domain.enabler`                                                                                          | Domain/interface split                         | Separate interface-neutral composition from interface contracts and surface rendering.                                                                            | Target receivers reviewed with dependency evidence.                                   | Spec audit and changes review.                                                          |
| `spx/23-spec-tree.enabler`, `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler`                         | Spec-tree and Outcome Engineering capabilities | Use these as inventory and catalysts for graph/context-loading behavior; do not assume either current path survives unchanged.                                    | Target capability receiver and ordering evidence reviewed.                            | Decompose-next projection review before edits.                                          |
| `spx/33-harness-environment.enabler`                                                                                  | Methodology context injection support          | Add SPX support for selecting and injecting methodology context from structured config.                                                                           | Methodology source path/version and config schema chosen.                             | Source validation, focused tests for config/context loading, and implementation review. |

## Required SPX Support

| Required support               | Current state                                                                                                                     | Change required                                                                                                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configured node kinds          | SPX admits `.enabler` and `.outcome` through current validation and context-loading assumptions.                                  | Add a structured node-kind registry driven by product configuration and methodology context. Validation, authoring, status, context loading, tests, and refactor tooling must read the same registry. |
| Methodology context injection  | Agents read installed skills and product-local `spx/` files. SPX does not yet select a methodology version as structured context. | Add structured methodology configuration, then inject methodology context from the configured source. This must support the current methodology and the next methodology.                             |
| Structured coordination inputs | Coordination notes are Markdown and manually read.                                                                                | Keep coordination notes human-facing. Put any skill-read facts in JSON or existing structured config files.                                                                                           |
| Target suffix migration        | `.surface`, `.domain`, `.interface`, and other target suffixes are not valid product node kinds today.                            | Implement suffix readiness before writing target suffixes into tracked `spx/` paths.                                                                                                                  |
| Context-safe migration         | Current paths mix capabilities, domains, interfaces, and surfaces.                                                                | Cut nodes apart only where a reviewed projection names the receiver, prerequisite SPX support, and verification route.                                                                                |

## Parked Work

| Parked area                                           | Reason                                                                                                       | Re-entry condition                                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Final root renumbering                                | Numeric order requires receiver decisions and dependency evidence.                                           | Re-enter after node-kind support and target receivers are reviewed.                                                               |
| Target suffix creation                                | SPX cannot validate or context-load those suffixes yet.                                                      | Re-enter when suffix readiness is implemented and verified.                                                                       |
| Wholesale node moves                                  | Functional nodes are fused; moving them whole preserves the wrong architecture.                              | Re-enter only with a split workflow that names behavior-level receivers.                                                          |
| Descendant `PLAN.md` sweep                            | Many descendant plans contain stale restructuring notes. Updating all at once would obscure the first slice. | Re-enter one owning area at a time after this root plan merges.                                                                   |
| Harness vocabulary sweep                              | It is a separate terminology axis from the structure migration.                                              | Re-enter from `spx/33-harness-environment.enabler/PLAN.md`.                                                                       |
| Release, diagnose, compact, package-publish mechanics | These are not needed to establish the target methodology migration path.                                     | Re-enter when a slice touches their owned behavior.                                                                               |
| Validation/test warning debt and security alerts      | They are tracked root issues with their own remediation paths.                                               | Re-enter from `spx/ISSUES.md` with a dedicated cleanup slice.                                                                     |
| Product-local methodology PDR replacement             | Outcome Engineering methodology belongs in the methodology repository first.                                 | Re-enter after SPX can inject configured methodology context and a product-local decision is needed to bind SPX-specific choices. |

## Delivery Order

1. Remove invalid root methodology PDRs and reduce this root plan to actionable coordination.
2. Add structured SPX support for configured node kinds and methodology context injection.
3. Build new work in the target structure by area role, using current `.enabler` paths only as holding paths until suffix readiness exists.
4. Split known fused nodes when a future part is already clear: persistence away from surfaces, verification types under verification, interface/surface wrappers away from provider semantics.
5. Determine the final target structure from reviewed projections and migrate paths only after SPX can represent, validate, context-load, test, and render the new node kinds.

## Verification Route

For this slice:

- `tsx src/cli.ts validation markdown spx/PLAN.md`
- `pnpm run validate`
- changes review for the branch
- `/merge`

For later slices, add focused `spx test <node>` only when source, tests, or executable specs change.
