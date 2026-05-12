# Plan: Spec-tree library refactor

## Purpose

Keep the reusable spec-tree library as the foundation for the refactor. This node owns backend-neutral source records, entry recognition, assembly, traversal, state derivation, projections, and config-owned vocabulary. Command behavior, terminal rendering, and CLI contracts belong in `spx/31-spec-domain.enabler/`.

## First tranche

- [x] Treat the current migrated tests as evidence inventory, then re-route each assertion through the spec-tree testing methodology before keeping it.
- [x] Replace direct fixture construction in spec-tree tests with `withSpecTreeEnv` where the proof requires a real product directory and use in-memory sources where the proof is pure source-record behavior.
- [ ] Keep one canonical public-surface scenario proving `readSpecTree`, `projectSpecTree`, and `findNextSpecTreeNode` together over a representative tree.
- [ ] Keep child-node tests focused on their owned behavior: source mapping, recognition mapping, assembly properties, traversal scenarios, state mapping, and projection conformance.
- [ ] Remove any command-formatting or terminal-output assertions from this node and move them to `spx/31-spec-domain.enabler/`.
- [ ] Replace remaining legacy `.capability`, `.feature`, and `.story` vocabulary in source, tests, and fixtures with registry-driven current vocabulary.
- [ ] Rename repository-root variables in library tests from legacy root vocabulary to product language when touching the harness or API boundary.

## Evidence matrix

| Owner                                                        | Assertion family                                                             | Evidence to keep or add                                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `spx/23-spec-tree.enabler/32-spec-tree-source.enabler/`      | Filesystem and in-memory source records map to equivalent recognized entries | Mapping tests comparing projection output from `withSpecTreeEnv` materialized fixtures and in-memory fixtures |
| `spx/23-spec-tree.enabler/43-entry-recognition.enabler/`     | Current suffixes map to typed entries; absent suffixes map to no entry       | Mapping tests against injected registry vocabulary                                                            |
| `spx/23-spec-tree.enabler/54-spec-tree-assembly.enabler/`    | Parent-child assembly preserves ordering and exactly one parent              | Property tests over generated current node records                                                            |
| `spx/23-spec-tree.enabler/65-spec-tree-traversal.enabler/`   | Next-node selection returns the first non-passing node or no node            | Scenario tests over assembled snapshots                                                                       |
| `spx/23-spec-tree.enabler/76-node-state-derivation.enabler/` | Evidence combinations map to declared, specified, failing, and passing       | Mapping tests through public snapshot construction                                                            |
| `spx/23-spec-tree.enabler/87-spec-tree-projection.enabler/`  | Projection output conforms to the stable contract                            | Conformance tests against named projection keys exported through the public surface                           |
| `spx/23-spec-tree.enabler/`                                  | Kind registry strings are owned once and projected everywhere                | Mapping/property/compliance tests against `SPEC_TREE_CONFIG` and `KIND_REGISTRY`                              |

## Remaining work

- [x] Audit every assertion link in this node and each child node against the current test file body.
- [ ] Delete or rewrite tests whose only value is proving the old work-item model.
- [ ] Move reusable fixture helpers into the `withSpecTreeEnv` harness instead of node-local support files.
- [ ] Keep source adapters free of command formatting, terminal labels, and CLI flag handling.
- [ ] Keep command modules from parsing suffixes by preserving `src/lib/spec-tree/index.ts` as the public import boundary.
- [ ] Split `src/lib/spec-tree/index.ts` internally only after the public tests pass and the extracted modules keep the same public surface.
- [ ] Remove legacy source modules after all command and validation consumers read the current spec-tree library.

## Tracked Deferrals

- [ ] Resolve the 2 warning-level `spx/no-test-owned-domain-constants` findings reported by `pnpm run validate` on May 12, 2026:
  - `spx/23-spec-tree.enabler/54-spec-tree-assembly.enabler/tests/spec-tree-assembly.property.l1.test.ts`

## Validation

- [x] Run focused tests for `spx/22-test-environment.enabler/32-spec-tree-fixtures.enabler/`, `spx/23-spec-tree.enabler/`, and all child nodes.
- [x] Run `spx validation all`.
- [ ] Run the full package test gate after legacy modules are removed.

## Acceptance

- [ ] The public spec-tree surface remains the only consumer import path for reading, projecting, and selecting from a spec tree.
- [ ] Tests prove both in-memory and real-directory spec-tree structures where each assertion requires them.
- [ ] Current `.enabler` and `.outcome` node vocabulary is accepted; legacy `.capability`, `.feature`, and `.story` vocabulary is rejected unless a separate current spec declares an explicit import path.
- [ ] State and projection behavior are derived from source records and evidence providers, not stored command state.
