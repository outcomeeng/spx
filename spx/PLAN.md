# Plan: Migrate `21-core-cli.capability` Into Current Spec Tree

## Status

The earlier plan is retired. It assumed a mechanical `.story` -> `.feature` -> `.capability` cleanup and kept the old `Core CLI` framing. That framing is stale: the subtree describes a legacy work-item CLI over `capability` / `feature` / `story`, while the current product truth is an agent harness with config-owned spec-tree vocabulary, deterministic spec-tree operations, testing, validation, and session management.

Final structure for this migration: every retained node becomes an `.enabler`. No migrated node becomes an `.outcome`.

Validation is postponed until the migration has a coherent source/spec shape. The working rule for this plan is: analyze and rewrite first, then run the full gate at the end.

## Configuration Boundary

`spx.config.yaml` is structured semantic config content. Its current top-level section is `literal`, with `allowlist.presets` and `allowlist.include` beneath it. The spec-tree vocabulary belongs in the same descriptor-driven config system through the existing `specTree` descriptor, with code-owned defaults and optional yaml selection.

The reusable spec-tree interface must preserve the config boundary:

1. Preserve `spx/23-spec-tree.enabler/21-kind-registry.adr.md` as the architectural baseline: a single `as const` registry constructs typed semantic views from primitive strings.
2. Amend the ADR only where the current baseline needs explicit ownership for display labels and aliases.
3. Rewrite `spx/23-spec-tree.enabler/spec-tree.md` assertions to describe the full registry entry shape: section keys, category values, kind keys, display labels, suffixes, and aliases.
4. Extend `src/spec/config.ts` so `KIND_REGISTRY` owns each product string once:
   - section names such as `specTree`
   - category keys such as node and decision
   - kind keys such as enabler, outcome, adr, pdr
   - display labels such as Enabler, ADR, PDR
   - future vocabulary such as OutConn when that kind is introduced
   - suffixes such as `.enabler`, `.outcome`, `.adr.md`, `.pdr.md`
5. Keep the strings grouped by kind entry and registry metadata. Do not export ten unrelated constants.
6. Derive all public views from the registry: kind unions, category partitions, suffix lists, labels, yaml validation, and command/reporting vocabulary.
7. Update tests so expected values come from the registry, not repeated literals.
8. Reduce `spx.config.yaml` literal allowlist entries that existed only because source/tests duplicated vocabulary.

## Current Drift To Resolve

- `spx/23-spec-tree.enabler/21-kind-registry.adr.md` gives the right single-registry architecture; it needs any missing label/alias ownership made explicit.
- `src/spec/config.ts` owns keys, categories, and suffixes; it lacks display labels and future semantic aliases.
- `spx/23-spec-tree.enabler/tests/*` repeat kind/category/suffix strings in assertions.
- `src/spec/apply/exclude/constants.ts` owns a separate node suffix list and still includes legacy suffixes.
- `src/types.ts`, `src/scanner/*`, `src/tree/*`, `src/reporter/*`, and `src/commands/spec/*` still model legacy work items.
- `21-core-cli.capability` contains useful concerns, but its root name and hierarchy are legacy packaging.

## Tracked Validation Warning Backlog

`pnpm run validate` on 2026-04-28 passes all six checks and still prints 251 ESLint `no-restricted-syntax` warnings for string literals in assertions. Representative examples from the validation output:

- `spx/21-core-cli.capability/21-pattern-matching.feature/21-parse-capability-names.story/tests/patterns.unit.test.ts:33:30`
- `spx/21-core-cli.capability/65-output-formatting.enabler/tests/output-formatting.scenario.l1.test.ts:23:30`
- `spx/46-claude.outcome/21-settings-consolidation.outcome/32-subsumption-merging.outcome/tests/subsumption.unit.test.ts:19:30`

Skills for the cleanup: `typescript:testing-typescript`, `typescript:auditing-typescript-tests`, and `spec-tree:aligning`.

Resolution: after the staged config/spec-tree correction is preserved, convert the warning files to source-owned registries, source-side generators, or explicit typed-protocol exceptions allowed by the testing skill. Re-run `pnpm run validate` and keep this warning count at zero before closing the migration.

## Library Boundary

`23-spec-tree.enabler` owns the reusable spec-tree library. It defines the backend-neutral source abstraction, entry recognition, tree assembly, traversal, state derivation, and stable projections. The filesystem is one source adapter; Linear, GitHub Issues, an ORM, or a paper ledger can expose the same source records and relationships.

`31-spec-domain.enabler` owns the CLI consumer of that library: command wiring, terminal-oriented rendering, command flags, errors, and contract tests.

## Stable Spec Tree Surface

Design the public interface before migrating internal modules. Other modules consume the spec tree through one public surface; scanner, tree, reporter, and registry internals stay behind that boundary.

Target public module:

```ts
export type SpecTreeSource = {
  entries(): AsyncIterable<SpecTreeSourceEntry>;
  readText?(ref: SpecTreeSourceRef): Promise<string>;
};

export type SpecTreeOptions = {
  source: SpecTreeSource;
  registry?: SpecTreeRegistry;
  evidence?: SpecTreeEvidenceProvider;
};

export function readSpecTree(options: SpecTreeOptions): Promise<SpecTreeSnapshot>;
export function projectSpecTree(snapshot: SpecTreeSnapshot): SpecTreeProjection;
export function findNextSpecTreeNode(snapshot: SpecTreeSnapshot): SpecTreeNode | null;
```

Consumer contracts:

- `src/commands/spec/*` reads a `SpecTreeSnapshot`, asks for projections or next-node selection, and owns only command flags, command errors, and terminal rendering.
- `src/spec/apply/exclude/*` reads node state from `SpecTreeSnapshot`; it does not walk the filesystem or parse suffixes itself.
- `src/reporter/*` either moves behind `projectSpecTree` or becomes CLI rendering under `31-spec-domain.enabler`.
- `src/scanner/*` and `src/tree/*` become internals of the `23-spec-tree.enabler` implementation or are deleted after their behavior is absorbed.
- Tests use a source fixture that implements `SpecTreeSource`, so the same assertions apply to filesystem, in-memory, Linear, GitHub Issues, ORM, or paper-ledger adapters.

Stable-surface tests come before implementation slices. They use canonical evidence/level filenames and target the public API:

- `spec-tree-surface.scenario.l1.test.ts`: a representative source produces a complete `SpecTreeSnapshot`.
- `spec-tree-source.mapping.l1.test.ts`: filesystem-shaped source records and in-memory source records map to the same entries.
- `spec-tree-assembly.property.l1.test.ts`: parent/child ordering and dependency invariants hold across generated source records.
- `node-state-derivation.mapping.l1.test.ts`: spec/test evidence maps to declared, specified, failing, and passing node states through the public snapshot.
- `spec-tree-projection.conformance.l1.test.ts`: projection output keeps a stable contract for command and automation consumers.

Existing `spx/23-spec-tree.enabler/tests/` registry evidence uses canonical evidence/level filenames.

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
|-- 23-spec-tree.enabler/
|   |-- spec-tree.md
|   |-- 21-kind-registry.adr.md
|   |-- 32-spec-tree-source.enabler/
|   |   `-- spec-tree-source.md
|   |-- 43-entry-recognition.enabler/
|   |   `-- entry-recognition.md
|   |-- 54-spec-tree-assembly.enabler/
|   |   `-- spec-tree-assembly.md
|   |-- 65-spec-tree-traversal.enabler/
|   |   `-- spec-tree-traversal.md
|   |-- 76-node-state-derivation.enabler/
|   |   `-- node-state-derivation.md
|   `-- 87-spec-tree-projection.enabler/
|       `-- spec-tree-projection.md
|-- 31-spec-domain.enabler/
|   |-- spec-domain.md
|   |-- 32-spec-cli-rendering.enabler/
|   |   `-- spec-cli-rendering.md
|   |-- 54-spec-cli-commands.enabler/
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

| Source node                       | Immediate children read                                                                                                                                                                                                                                     | Disposition                                                                                                                                                                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `21-core-cli.capability`          | `21-pattern-matching.feature`, `32-directory-walking.enabler`, `43-status-determination.feature`, `48-test-harness.enabler`, `54-tree-building.enabler`, `65-output-formatting.enabler`, `76-cli-integration.enabler`, `87-e2e-workflow.feature`, four ADRs | Dissolve. Move/rewrite useful assertions into the destinations below; delete the legacy root after all retained content has a home.                                                                                                                         |
| `21-pattern-matching.feature`     | capability parsing, feature parsing, story parsing, legacy number validation, test factories                                                                                                                                                                | Rewrite as `23-spec-tree.enabler/43-entry-recognition.enabler`. Replace legacy work-item parsing with config-backed spec-tree entry recognition over abstract source records. Current ordering rules decide whether any numeric validation remains.         |
| `32-directory-walking.enabler`    | recursive walk, pattern filter, work-item list building, edge cases                                                                                                                                                                                         | Split into `23-spec-tree.enabler/32-spec-tree-source.enabler` for filesystem-backed source enumeration and `23-spec-tree.enabler/65-spec-tree-traversal.enabler` for backend-neutral traversal. File inclusion stays in `17-file-inclusion.enabler`.        |
| `43-status-determination.feature` | state machine, tests directory detection, DONE.md parsing, status edge cases                                                                                                                                                                                | Rewrite as `23-spec-tree.enabler/76-node-state-derivation.enabler` only for current spec-tree state. Remove the legacy `tests/DONE.md` status model unless a current spec says it remains product truth.                                                    |
| `48-test-harness.enabler`         | context manager, fixture integration                                                                                                                                                                                                                        | Merge into `22-test-environment.enabler/32-spec-tree-fixtures.enabler`. Preserve callback-scoped temp environments and generated fixtures using the current `withTestEnv` vocabulary.                                                                       |
| `54-tree-building.enabler`        | parent-child links, legacy number sorting, status rollup, tree validation                                                                                                                                                                                   | Move/rewrite as `23-spec-tree.enabler/54-spec-tree-assembly.enabler`. Parent/child constraints derive from spec-tree structure and ordering rules, not from capability/feature/story depth.                                                                 |
| `65-output-formatting.enabler`    | text formatter, JSON formatter, markdown formatter, table formatter                                                                                                                                                                                         | Split. Stable tree/state projections go to `23-spec-tree.enabler/87-spec-tree-projection.enabler`; terminal-oriented command rendering goes to `31-spec-domain.enabler/32-spec-cli-rendering.enabler`. Labels and headings read from the semantic registry. |
| `76-cli-integration.enabler`      | status command, next command, format options, error handling                                                                                                                                                                                                | Move/rewrite as `31-spec-domain.enabler/54-spec-cli-commands.enabler`. Keep `spx spec status` and `spx spec next` behavior aligned to current spec-tree projections and state.                                                                              |
| `87-e2e-workflow.feature`         | fixture generator, fixture writer, E2E validation                                                                                                                                                                                                           | Split. Fixture generator/writer go to `22-test-environment.enabler/32-spec-tree-fixtures.enabler`; E2E behavior goes to `31-spec-domain.enabler/76-spec-cli-contract-tests.enabler`.                                                                        |

## ADR Disposition

| Source decision                      | Disposition                                                                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `001-cli-framework.adr.md`           | Rewrite under `31-spec-domain.enabler` if it governs spec commands; move to product root only if it governs all CLI domains.                                            |
| `002-tree-structure-contract.adr.md` | Rewrite into `23-spec-tree.enabler/54-spec-tree-assembly.enabler` if the current hierarchy contract remains true; delete legacy capability/feature/story contract text. |
| `003-e2e-fixture-generation.adr.md`  | Merge into `22-test-environment.enabler` fixture generation decision.                                                                                                   |
| `004-test-environment.adr.md`        | Merge into the existing test-environment decision set and remove duplicate temp-environment rules.                                                                      |

## Execution Phases

1. Design the stable spec-tree surface:
   - define the public `SpecTreeSource`, `SpecTreeSnapshot`, projection, and next-node selection contracts
   - rewrite parent spec assertions around the public interface consumed by other modules
   - write canonical stable-surface tests before internal migration starts
   - rename inherited test files to evidence/level filenames as part of the migration plan

2. Align the config/spec-tree specs:
   - preserve the kind-registry ADR baseline and amend label/alias ownership where needed
   - rewrite the spec-tree assertions around the full semantic registry entry shape
   - define acceptance tests that prove strings are declared once and consumed by reference

3. Implement the semantic config module:
   - extend the flat `KIND_REGISTRY` entries in `src/spec/config.ts`
   - derive compatibility exports only where needed during the migration
   - update config descriptor validation and config tests
   - route `src/spec/testing/index.ts` and `src/spec/apply/exclude/*` through the registry

4. Migrate legacy code consumers:
   - replace `WorkItemKind` and `WORK_ITEM_KINDS` with spec-tree vocabulary types
   - update scanner/tree/reporter/spec-command modules to consume the spec-tree library and config-derived vocabulary
   - remove legacy suffix constants once no consumer needs them

5. Refactor the spec tree:
   - create destination `.enabler` nodes only after their parent specs are aligned
   - keep backend-neutral spec-tree modeling under `23-spec-tree.enabler`
   - keep CLI command behavior under `31-spec-domain.enabler`
   - for each legacy node, read parent spec plus immediate child specs before moving content
   - use `git mv` for retained tracked files
   - use `git rm` only after the content is rewritten or rejected as obsolete legacy behavior

6. Clean the literal allowlist:
   - remove allowlist entries made unnecessary by semantic constants
   - keep only examples, test descriptions, and unavoidable fixture text

7. Final verification:
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

### 1. Design Stable Spec Tree Surface

- [x] Define the public `SpecTreeSource`, `SpecTreeSourceEntry`, `SpecTreeSnapshot`, `SpecTreeNode`, `SpecTreeDecision`, `SpecTreeProjection`, and `SpecTreeEvidenceProvider` types.
- [x] Define public operations for reading a tree, projecting a tree, and selecting the next actionable node.
- [x] Decide the source module path for the public surface and update the ADR if the implementation moves registry exports behind that surface.
- [x] Rewrite `spx/23-spec-tree.enabler/spec-tree.md` assertions so other modules consume only the public surface.
- [x] Add or rename stable-surface tests with canonical evidence/level filenames:
  - `spec-tree-surface.scenario.l1.test.ts`
  - `spec-tree-source.mapping.l1.test.ts`
  - `spec-tree-assembly.property.l1.test.ts`
  - `node-state-derivation.mapping.l1.test.ts`
  - `spec-tree-projection.conformance.l1.test.ts`
- [x] Ensure the stable-surface tests use a `SpecTreeSource` fixture without reading source files directly.
- [x] Add `23-spec-tree.enabler` to `spx/EXCLUDE` while the interface tests declare behavior ahead of implementation.

### 2. Align Specs For Semantic Vocabulary

- [ ] Preserve `spx/23-spec-tree.enabler/21-kind-registry.adr.md` as the baseline and amend it only for label/alias ownership.
- [ ] Rewrite `spx/23-spec-tree.enabler/spec-tree.md` assertions around section keys, category keys, kind keys, labels, suffixes, and aliases.
- [ ] Update or add canonical tests under `spx/23-spec-tree.enabler/tests/` that prove each vocabulary string has one declaration site.
- [ ] Rewrite config-related tests under `spx/16-config.enabler/tests/` that currently repeat kind/category/suffix literals.
- [ ] Record any deliberately retained fixture/example literals in `spx.config.yaml` under `literal.allowlist.include`.

### 3. Implement Semantic Config Vocabulary

- [ ] Extend the flat `KIND_REGISTRY` in `src/spec/config.ts` so each entry owns its kind, category, label, suffix, and aliases.
- [ ] Derive existing public views from the registry during migration: kind unions, category partitions, suffix lists, and descriptor defaults.
- [ ] Update `specTreeConfigDescriptor` validation so yaml selection compares against registry values.
- [ ] Update `src/config/registry.ts` only if the descriptor export shape changes.
- [ ] Update `src/spec/testing/index.ts` to read section/category/kind names through the semantic registry.
- [ ] Update `src/spec/apply/exclude/*` to consume node suffixes from the registry instead of its local suffix list.

### 4. Remove Legacy Work-Item Vocabulary From Source

- [ ] Replace `WorkItemKind` and `WORK_ITEM_KINDS` in `src/types.ts` with current spec-tree vocabulary types.
- [ ] Update `src/scanner/patterns.ts`, `src/scanner/walk.ts`, and `src/scanner/scanner.ts` to parse current spec-tree entries through config-derived vocabulary.
- [ ] Update `src/tree/*` so hierarchy and validation rules derive from current spec-tree categories.
- [ ] Update `src/reporter/*` so display labels come from the semantic registry.
- [ ] Update `src/commands/spec/*` and `src/domains/spec/*` so command behavior targets current spec-tree state and names.
- [ ] Delete legacy-only suffix constants after all consumers move.

### 5. Refactor Spec Nodes Top Down

- [ ] For `21-core-cli.capability`, read the root spec and every immediate child spec before moving content.
- [ ] Create or rewrite `23-spec-tree.enabler/32-spec-tree-source.enabler`.
- [ ] Move/rewrite filesystem enumeration and source-record assertions into spec-tree source abstraction.
- [ ] Create or rewrite `23-spec-tree.enabler/43-entry-recognition.enabler`.
- [ ] Move/rewrite pattern-matching assertions into entry recognition and prune capability/feature/story parsing content.
- [ ] Create or rewrite `23-spec-tree.enabler/54-spec-tree-assembly.enabler`.
- [ ] Move/rewrite tree-building assertions into current spec-tree assembly.
- [ ] Create or rewrite `23-spec-tree.enabler/65-spec-tree-traversal.enabler`.
- [ ] Move/rewrite directory-walking traversal assertions into backend-neutral spec-tree traversal.
- [ ] Create or rewrite `23-spec-tree.enabler/76-node-state-derivation.enabler`.
- [ ] Move/rewrite status-determination assertions into current spec-tree state derivation.
- [ ] Create or rewrite `23-spec-tree.enabler/87-spec-tree-projection.enabler`.
- [ ] Move/rewrite reusable output shape assertions into spec-tree projections.
- [ ] Create or rewrite `22-test-environment.enabler/32-spec-tree-fixtures.enabler`.
- [ ] Move/rewrite test-harness, fixture-generator, and fixture-writer content into test environment.
- [ ] Create or rewrite `31-spec-domain.enabler/32-spec-cli-rendering.enabler`.
- [ ] Move/rewrite terminal-oriented formatting assertions into spec CLI rendering.
- [ ] Create or rewrite `31-spec-domain.enabler/54-spec-cli-commands.enabler`.
- [ ] Move/rewrite CLI integration assertions into current `spx spec status` and `spx spec next` behavior.
- [ ] Create or rewrite `31-spec-domain.enabler/76-spec-cli-contract-tests.enabler`.
- [ ] Move/rewrite E2E validation content into spec-domain contract tests.
- [ ] Merge or delete `001-cli-framework.adr.md`, `002-tree-structure-contract.adr.md`, `003-e2e-fixture-generation.adr.md`, and `004-test-environment.adr.md` according to the ADR disposition table.
- [ ] Delete `21-core-cli.capability` only after every retained assertion and decision has a current owner.

### 6. Clean Literal Debt

- [ ] Remove `spx.config.yaml` allowlist entries made unnecessary by semantic constants.
- [ ] Keep fixture/example literals only when the literal itself is the behavior under test.
- [ ] Replace repeated status, command, label, and suffix strings in tests with registry references or typed fixture builders.
- [ ] Run the literal validation step and fix real duplication findings.

### 7. Final Verification

- [ ] Run `spx validation all`.
- [ ] Run the relevant co-located tests for `16-config.enabler`, `22-test-environment.enabler`, `23-spec-tree.enabler`, and `31-spec-domain.enabler`.
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
- Backend-neutral spec-tree modeling stays under `23-spec-tree.enabler`.
- CLI command behavior stays under `31-spec-domain.enabler`.
- No source module owns a spec-tree string that belongs to the semantic registry.
- No parallel suffix arrays, kind unions, display-label constants, or hardcoded command formatter labels.
- No compatibility shim whose only purpose is preserving the old work-item vocabulary.
