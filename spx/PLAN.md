# Plan: Migrate `21-core-cli.capability` Into Current Spec Tree

## Status

The earlier plan is retired. It assumed a mechanical `.story` -> `.feature` -> `.capability` cleanup and kept the old `Core CLI` framing. That framing is stale: the subtree describes a legacy work-item CLI over `capability` / `feature` / `story`, while the current product truth is an agent harness with config-owned spec-tree vocabulary, deterministic spec-tree operations, testing, validation, and session management.

Final structure for this migration: every retained node becomes an `.enabler`. No migrated node becomes an `.outcome`.

Validation is postponed until the migration has a coherent source/spec shape. The working rule for this plan is: analyze and rewrite first, then run the full gate at the end.

## Configuration Boundary First

`spx.config.yaml` is structured semantic config content. Its current top-level section is `literal`, with `allowlist.presets` and `allowlist.include` beneath it. The spec-tree vocabulary belongs in the same descriptor-driven config system through the existing `specTree` descriptor, with code-owned defaults and optional yaml selection.

The first implementation phase is the config/spec-tree vocabulary repair:

1. Rewrite `spx/23-spec-tree-shape.enabler/21-kind-registry.adr.md` so it requires a semantic vocabulary object, not a flat `KIND_REGISTRY`.
2. Rewrite `spx/23-spec-tree-shape.enabler/spec-tree-shape.md` assertions to describe the semantic object: section keys, category keys, kind keys, display labels, suffixes, and aliases.
3. Replace `src/spec/config.ts` with a semantic object that owns each product string once:
   - section names such as `specTree`
   - category keys such as node and decision
   - kind keys such as enabler, outcome, adr, pdr
   - display labels such as Enabler, ADR, PDR
   - future vocabulary such as OutConn when that kind is introduced
   - suffixes such as `.enabler`, `.outcome`, `.adr.md`, `.pdr.md`
4. Keep the strings grouped by meaning inside one exported semantic object. Do not export ten unrelated constants.
5. Derive all public views from that object: kind unions, category partitions, suffix lists, labels, yaml validation, and command/reporting vocabulary.
6. Update tests so expected values come from the semantic object, not repeated literals.
7. Reduce `spx.config.yaml` literal allowlist entries that existed only because source/tests duplicated vocabulary.

## Current Drift To Resolve

- `spx/23-spec-tree-shape.enabler/21-kind-registry.adr.md` mandates a flat registry and explicitly rejects the nested semantic shape now required.
- `src/spec/config.ts` owns only keys, categories, and suffixes; it does not own display labels or future semantic aliases.
- `spx/23-spec-tree-shape.enabler/tests/*` repeat kind/category/suffix strings in assertions.
- `src/spec/apply/exclude/constants.ts` owns a separate node suffix list and still includes legacy suffixes.
- `src/types.ts`, `src/scanner/*`, `src/tree/*`, `src/reporter/*`, and `src/commands/spec/*` still model legacy work items.
- `21-core-cli.capability` contains useful concerns, but its root name and hierarchy are legacy packaging.

## Target Spec Tree

This is the target tree for the `21-core-cli.capability` migration. The legacy subtree dissolves; useful assertions and decisions move into current enabler owners.

```text
spx/
|-- spx.product.md
|-- 15-worktree-resolution.pdr.md
|-- 16-config.enabler/
|   |-- config.md
|   |-- 21-descriptor-registration.adr.md
|   |-- 21-config-file-formats.adr.md
|   `-- 21-config-cli.enabler/
|-- 17-file-inclusion.enabler/
|-- 17-language-detection.enabler/
|-- 19-language-registration.adr.md
|-- 22-test-environment.enabler/
|   |-- test-environment.md
|   |-- 21-callback-scoped-environment.adr.md
|   `-- 32-spec-tree-fixtures.enabler/
|       `-- spec-tree-fixtures.md
|-- 23-spec-tree-shape.enabler/
|   |-- spec-tree-shape.md
|   |-- 21-semantic-vocabulary.adr.md
|   `-- 21-semantic-vocabulary.enabler/
|       `-- semantic-vocabulary.md
|-- 31-spec-domain.enabler/
|   |-- spec-domain.md
|   |-- 21-spec-tree-traversal.enabler/
|   |   `-- spec-tree-traversal.md
|   |-- 32-node-state-derivation.enabler/
|   |   `-- node-state-derivation.md
|   |-- 43-spec-tree-assembly.enabler/
|   |   `-- spec-tree-assembly.md
|   |-- 54-spec-command-rendering.enabler/
|   |   `-- spec-command-rendering.md
|   |-- 65-spec-cli-commands.enabler/
|   |   `-- spec-cli-commands.md
|   `-- 76-spec-cli-contract-tests.enabler/
|       `-- spec-cli-contract-tests.md
|-- 36-audit.enabler/
|-- 36-session.enabler/
|-- 41-testing.enabler/
|-- 41-validation.enabler/
|-- 43-precommit.enabler/
|-- 46-claude.outcome/              # tracked separately in ISSUES.md
|-- 26-scoped-cli.capability/       # tracked separately in ISSUES.md
`-- 31-spec-domain.capability/      # tracked separately in ISSUES.md
```

The target for this plan removes `21-core-cli.capability` entirely. The remaining root-level structural debt is tracked in `spx/ISSUES.md` so it does not disappear from view.

## Top-Down Node Disposition

Each parent is classified only after reading its immediate children. File moves still happen with `git mv`; deletion happens only when the content is rewritten into the destination or rejected as obsolete legacy behavior.

| Source node                       | Immediate children read                                                                                                                                                                                                                                     | Disposition                                                                                                                                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `21-core-cli.capability`          | `21-pattern-matching.feature`, `32-directory-walking.enabler`, `43-status-determination.feature`, `48-test-harness.enabler`, `54-tree-building.enabler`, `65-output-formatting.enabler`, `76-cli-integration.enabler`, `87-e2e-workflow.feature`, four ADRs | Dissolve. Move/rewrite useful assertions into the destinations below; delete the legacy root after all retained content has a home.                                                                                                          |
| `21-pattern-matching.feature`     | capability parsing, feature parsing, story parsing, BSP validation, test factories                                                                                                                                                                          | Rewrite as `23-spec-tree-shape.enabler/21-semantic-vocabulary.enabler`. Replace legacy work-item parsing with config-backed spec-tree entry recognition. BSP validation belongs only if current ordering rules need a source assertion here. |
| `32-directory-walking.enabler`    | recursive walk, pattern filter, work-item list building, edge cases                                                                                                                                                                                         | Move/rewrite as `31-spec-domain.enabler/21-spec-tree-traversal.enabler`. Traversal consumes spec-tree vocabulary and file-inclusion APIs; it must not own suffixes or ignore policy.                                                         |
| `43-status-determination.feature` | state machine, tests directory detection, DONE.md parsing, status edge cases                                                                                                                                                                                | Rewrite as `31-spec-domain.enabler/32-node-state-derivation.enabler` only for current spec-tree state. Remove the legacy `tests/DONE.md` status model unless a current spec says it remains product truth.                                   |
| `48-test-harness.enabler`         | context manager, fixture integration                                                                                                                                                                                                                        | Merge into `22-test-environment.enabler/32-spec-tree-fixtures.enabler`. Preserve callback-scoped temp environments and generated fixtures using the current `withTestEnv` vocabulary.                                                        |
| `54-tree-building.enabler`        | parent-child links, BSP sorting, status rollup, tree validation                                                                                                                                                                                             | Move/rewrite as `31-spec-domain.enabler/43-spec-tree-assembly.enabler`. Parent/child constraints derive from spec-tree structure and ordering rules, not from capability/feature/story depth.                                                |
| `65-output-formatting.enabler`    | text formatter, JSON formatter, markdown formatter, table formatter                                                                                                                                                                                         | Move/rewrite as `31-spec-domain.enabler/54-spec-command-rendering.enabler`. Formatter labels and headings read from the semantic vocabulary object.                                                                                          |
| `76-cli-integration.enabler`      | status command, next command, format options, error handling                                                                                                                                                                                                | Move/rewrite as `31-spec-domain.enabler/65-spec-cli-commands.enabler`. Keep `spx spec status` and `spx spec next` behavior aligned to current spec-tree state.                                                                               |
| `87-e2e-workflow.feature`         | fixture generator, fixture writer, E2E validation                                                                                                                                                                                                           | Split. Fixture generator/writer go to `22-test-environment.enabler/32-spec-tree-fixtures.enabler`; E2E behavior goes to `31-spec-domain.enabler/76-spec-cli-contract-tests.enabler`.                                                         |

## ADR Disposition

| Source decision                      | Disposition                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `001-cli-framework.adr.md`           | Rewrite under `31-spec-domain.enabler` if it governs spec commands; move to product root only if it governs all CLI domains.          |
| `002-tree-structure-contract.adr.md` | Rewrite into spec-tree assembly if the current hierarchy contract remains true; delete legacy capability/feature/story contract text. |
| `003-e2e-fixture-generation.adr.md`  | Merge into `22-test-environment.enabler` fixture generation decision.                                                                 |
| `004-test-environment.adr.md`        | Merge into the existing test-environment decision set and remove duplicate temp-environment rules.                                    |

## Execution Phases

1. Align the config/spec-tree-shape specs:
   - rewrite the conflicting kind-registry ADR
   - rewrite the spec-tree-shape assertions around a semantic vocabulary object
   - define acceptance tests that prove strings are declared once and consumed by reference

2. Implement the semantic config module:
   - replace the flat registry in `src/spec/config.ts`
   - derive compatibility exports only where needed during the migration
   - update config descriptor validation and config tests
   - route `src/spec/testing/index.ts` and `src/spec/apply/exclude/*` through the semantic object

3. Migrate legacy code consumers:
   - replace `WorkItemKind` and `WORK_ITEM_KINDS` with spec-tree vocabulary types
   - update scanner/tree/reporter/spec-command modules to consume config-derived vocabulary
   - remove legacy suffix constants once no consumer needs them

4. Refactor the spec tree:
   - create destination `.enabler` nodes only after their parent specs are aligned
   - for each legacy node, read parent spec plus immediate child specs before moving content
   - use `git mv` for retained tracked files
   - use `git rm` only after the content is rewritten or rejected as obsolete legacy behavior

5. Clean the literal allowlist:
   - remove allowlist entries made unnecessary by semantic constants
   - keep only examples, test descriptions, and unavoidable fixture text

6. Final verification:
   - run `spx validation all`
   - run the relevant spec-node tests
   - fix validation failures after the structure is coherent

## Execution Task List

### 0. Preflight

- [ ] Confirm the only changed coordination files for this migration are `spx/PLAN.md` and `spx/ISSUES.md` before source/spec edits begin.
- [ ] Re-read `spx/CLAUDE.md`, `spx/spx.product.md`, root ADRs/PDRs, and `spx/local/typescript.md`.
- [ ] Re-read `spx/PLAN.md` and `spx/ISSUES.md`.
- [ ] Capture the current root tree shape for comparison.
- [ ] Confirm `21-core-cli.capability` still has the same immediate children listed in this plan.

### 1. Align Specs For Semantic Vocabulary

- [ ] Rewrite `spx/23-spec-tree-shape.enabler/21-kind-registry.adr.md` around a semantic vocabulary object.
- [ ] Rewrite `spx/23-spec-tree-shape.enabler/spec-tree-shape.md` assertions around section keys, category keys, kind keys, labels, suffixes, and aliases.
- [ ] Update or add tests under `spx/23-spec-tree-shape.enabler/tests/` that prove each vocabulary string has one declaration site.
- [ ] Rewrite config-related tests under `spx/16-config.enabler/tests/` that currently repeat kind/category/suffix literals.
- [ ] Record any deliberately retained fixture/example literals in `spx.config.yaml` under `literal.allowlist.include`.

### 2. Implement Semantic Config Vocabulary

- [ ] Replace the flat `KIND_REGISTRY` in `src/spec/config.ts` with one semantic object that groups sections, categories, kinds, labels, suffixes, and aliases.
- [ ] Derive existing public views from the semantic object during migration: kind unions, category partitions, suffix lists, and descriptor defaults.
- [ ] Update `specTreeConfigDescriptor` validation so yaml selection compares against semantic-object values.
- [ ] Update `src/config/registry.ts` only if the descriptor export shape changes.
- [ ] Update `src/spec/testing/index.ts` to read section/category/kind names through semantic vocabulary.
- [ ] Update `src/spec/apply/exclude/*` to consume node suffixes from the semantic vocabulary instead of its local suffix list.

### 3. Remove Legacy Work-Item Vocabulary From Source

- [ ] Replace `WorkItemKind` and `WORK_ITEM_KINDS` in `src/types.ts` with current spec-tree vocabulary types.
- [ ] Update `src/scanner/patterns.ts`, `src/scanner/walk.ts`, and `src/scanner/scanner.ts` to parse current spec-tree entries through config-derived vocabulary.
- [ ] Update `src/tree/*` so hierarchy and validation rules derive from current spec-tree categories.
- [ ] Update `src/reporter/*` so display labels come from semantic vocabulary.
- [ ] Update `src/commands/spec/*` and `src/domains/spec/*` so command behavior targets current spec-tree state and names.
- [ ] Delete legacy-only suffix constants after all consumers move.

### 4. Refactor Spec Nodes Top Down

- [ ] For `21-core-cli.capability`, read the root spec and every immediate child spec before moving content.
- [ ] Create or rewrite `23-spec-tree-shape.enabler/21-semantic-vocabulary.enabler`.
- [ ] Move/rewrite pattern-matching assertions into semantic vocabulary and prune capability/feature/story parsing content.
- [ ] Create or rewrite `31-spec-domain.enabler/21-spec-tree-traversal.enabler`.
- [ ] Move/rewrite directory-walking assertions into spec-tree traversal.
- [ ] Create or rewrite `31-spec-domain.enabler/32-node-state-derivation.enabler`.
- [ ] Move/rewrite status-determination assertions into current spec-tree state derivation.
- [ ] Create or rewrite `22-test-environment.enabler/32-spec-tree-fixtures.enabler`.
- [ ] Move/rewrite test-harness, fixture-generator, and fixture-writer content into test environment.
- [ ] Create or rewrite `31-spec-domain.enabler/43-spec-tree-assembly.enabler`.
- [ ] Move/rewrite tree-building assertions into current spec-tree assembly.
- [ ] Create or rewrite `31-spec-domain.enabler/54-spec-command-rendering.enabler`.
- [ ] Move/rewrite output-formatting assertions into spec command rendering.
- [ ] Create or rewrite `31-spec-domain.enabler/65-spec-cli-commands.enabler`.
- [ ] Move/rewrite CLI integration assertions into current `spx spec status` and `spx spec next` behavior.
- [ ] Create or rewrite `31-spec-domain.enabler/76-spec-cli-contract-tests.enabler`.
- [ ] Move/rewrite E2E validation content into spec-domain contract tests.
- [ ] Merge or delete `001-cli-framework.adr.md`, `002-tree-structure-contract.adr.md`, `003-e2e-fixture-generation.adr.md`, and `004-test-environment.adr.md` according to the ADR disposition table.
- [ ] Delete `21-core-cli.capability` only after every retained assertion and decision has a current owner.

### 5. Clean Literal Debt

- [ ] Remove `spx.config.yaml` allowlist entries made unnecessary by semantic constants.
- [ ] Keep fixture/example literals only when the literal itself is the behavior under test.
- [ ] Replace repeated status, command, label, and suffix strings in tests with semantic-object references or typed fixture builders.
- [ ] Run the literal validation step and fix real duplication findings.

### 6. Final Verification

- [ ] Run `spx validation all`.
- [ ] Run the relevant co-located tests for `16-config.enabler`, `22-test-environment.enabler`, `23-spec-tree-shape.enabler`, and `31-spec-domain.enabler`.
- [ ] Run any E2E tests moved from `21-core-cli.capability`.
- [ ] Update `spx/ISSUES.md` with any remaining root-level structural debt.
- [ ] Confirm no `.capability`, `.feature`, or `.story` paths remain under migrated content.
- [ ] Confirm no migrated node is an `.outcome`.

## Target Spec Tree Document

- This file's "Target Spec Tree" section is the visible target tree for the `21-core-cli.capability` migration.
- `spx/CLAUDE.md` and `spx/AGENTS.md` describe the general spec-tree rules and current directory contract.

## Non-Negotiables

- No new `capability`, `feature`, or `story` nodes.
- No migrated node becomes an outcome.
- No source module owns a spec-tree string that belongs to the semantic vocabulary object.
- No parallel suffix arrays, kind unions, display-label constants, or hardcoded command formatter labels.
- No compatibility shim whose only purpose is preserving the old work-item vocabulary.
