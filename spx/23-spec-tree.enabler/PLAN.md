# Plan: Logical foundation ownership repair

> **Reconcile against `spx/PLAN.md` first.** The root plan treats current paths as inventory, projects substrate / capability / domain / interface / surface area roles, parks target suffix migration until SPX supports configured node kinds and methodology context injection, and uses active migration rows for executable work. Treat this spec-tree node as current inventory for target capability projection until a reviewed receiver and ordering evidence settle its final shape. Where this note predates the root plan, the root plan governs.

This coordination note preserves the spec-tree foundation repair before `/decompose` and `/author` produce durable specs and decisions.

## Ownership target

`spx/23-spec-tree.enabler` should own spec-tree business logic:

- node identity and relationships
- dependency graph semantics
- state model and state derivation
- status semantics and stale/fresh projection
- projection contracts
- logical operations over nodes, evidence, and materialization state

The consumer `spx/31-spec-domain.enabler` should call this foundation and expose cross-library composition operations; the surface layer `spx/60-surfaces.enabler` (root `spx/PLAN.md`) renders or adapts results per interface.

## Parked persistence and backend structure

The root `spx/PLAN.md` owns the reviewed target distinction between persistence, backend, delivery, and node state. No placeholder node represents that target while configured node kinds, methodology context injection, receiver classification, containment, and dependency evidence remain unresolved.

Re-enter this structure only after SPX can represent the target node kinds and a reviewed projection names the persistence and backend receivers with ordering evidence. Until then, current implementation paths remain inventory rather than target structure.

## Concerns to pull from spec-domain

Move or re-author these concerns under this node:

- status dependency graph semantics
- stale/fresh projection semantics
- state vocabulary beyond the current four states, including future `prototype`
- generic node metadata vocabulary
- logical status operations that interfaces consume

Keep these outside this node:

- CLI flag parsing and terminal rendering
- web API, MCP, and UI adapters
- language runner implementation
- backend-specific storage encoding, except through child backend nodes

## Immediate next steps

1. If the repair surfaces a methodology vocabulary term SPX lacks, record it in the external methodology work and root coordination first; do not author a product-local methodology PDR before SPX can inject configured methodology context.
2. Keep persistence, backend, delivery, and node-state concerns separate when inventory is classified for a reviewed target projection.
3. Amend existing source, state, and projection nodes only after the target receivers and ordering evidence are settled.

---

## Existing plan: Spec-tree library refactor

## Purpose

Keep the reusable spec-tree library as the foundation for the refactor. This node owns backend-neutral source records, entry recognition, assembly, traversal, state derivation, projections, and config-owned vocabulary. Command behavior, terminal rendering, and CLI contracts live today in `spx/31-spec-domain.enabler/`; root `spx/PLAN.md` moves them to the surface layer `spx/60-surfaces.enabler/21-cli-surface.enabler/`. Either way they stay out of this library node.

## First tranche

- [x] Treat the current migrated tests as evidence inventory, then re-route each assertion through the spec-tree testing methodology before keeping it.
- [x] Replace direct fixture construction in spec-tree tests with `withSpecTreeEnv` where the proof requires a real product directory and use in-memory sources where the proof is pure source-record behavior.
- [x] Keep one canonical public-surface scenario proving `readSpecTree`, `projectSpecTree`, and `findNextSpecTreeNode` together over a representative tree.
- [x] Keep child-node tests focused on their owned behavior: source mapping, recognition mapping, assembly properties, traversal scenarios, state mapping, and projection conformance.
- [x] Remove any command-formatting or terminal-output assertions from this node and move them to `spx/31-spec-domain.enabler/`.
- [x] Replace remaining deprecated node vocabulary in source, tests, and fixtures with registry-driven current vocabulary.
- [x] Rename repository-root variables in library tests from legacy root vocabulary to product language when touching the harness or API boundary.

## Evidence matrix

| Owner                                                        | Assertion family                                                                                                   | Evidence to keep or add                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `spx/23-spec-tree.enabler/32-spec-tree-source.enabler/`      | Filesystem and in-memory source records map to equivalent recognized entries                                       | Mapping tests comparing projection output from `withSpecTreeEnv` materialized fixtures and in-memory fixtures |
| `spx/23-spec-tree.enabler/43-entry-recognition.enabler/`     | Names classify valid (canonical) / superseded (prior version) / invalid (no version) against the versioned grammar | Mapping tests (`version-classification`, `evidence-recognition`) against injected schema-version fixtures     |
| `spx/23-spec-tree.enabler/54-spec-tree-assembly.enabler/`    | Parent-child assembly preserves ordering and exactly one parent                                                    | Property tests over generated current node records                                                            |
| `spx/23-spec-tree.enabler/65-spec-tree-traversal.enabler/`   | Next-node selection returns the first non-passing node or no node                                                  | Scenario tests over assembled snapshots                                                                       |
| `spx/23-spec-tree.enabler/76-node-state-derivation.enabler/` | Evidence combinations map to declared, specified, failing, and passing                                             | Mapping tests through public snapshot construction                                                            |
| `spx/23-spec-tree.enabler/87-spec-tree-projection.enabler/`  | Projection output conforms to the stable contract                                                                  | Conformance tests against named projection keys exported through the public surface                           |
| `spx/23-spec-tree.enabler/`                                  | Kind registry strings are owned once and projected everywhere                                                      | Mapping/property/compliance tests against `SPEC_TREE_CONFIG` and `KIND_REGISTRY`                              |

## Remaining work

- [x] Audit every assertion link in this node and each child node against the current test file body.
- [x] Delete or rewrite tests whose only value is proving the old work-item model.
- [ ] Move reusable fixture helpers into the `withSpecTreeEnv` harness instead of node-local support files.
- [x] Keep source adapters free of command formatting, terminal labels, and CLI flag handling.
- [ ] Keep command modules from parsing suffixes by preserving `src/lib/spec-tree/index.ts` as the public import boundary.
- [ ] Split `src/lib/spec-tree/index.ts` internally only after the public tests pass and the extracted modules keep the same public surface.
- [x] Remove legacy source modules after all command and validation consumers read the current spec-tree library.

## Tracked Deferrals

- [x] Resolve the 2 warning-level `spx/no-test-owned-domain-constants` findings reported by `pnpm run validate` on May 12, 2026:
  - `spx/23-spec-tree.enabler/54-spec-tree-assembly.enabler/tests/spec-tree-assembly.property.l1.test.ts`

## Validation

- [x] Run focused tests for `spx/22-test-environment.enabler/32-spec-tree-fixtures.enabler/`, `spx/23-spec-tree.enabler/`, and all child nodes.
- [x] Run `spx validation all`.
- [x] Run the full package test gate after legacy modules are removed.

## Acceptance

- [ ] The public spec-tree surface remains the only consumer import path for reading, projecting, and selecting from a spec tree.
- [ ] Tests prove both in-memory and real-directory spec-tree structures where each assertion requires them.
- [ ] Current `.enabler` and `.outcome` node vocabulary is accepted; deprecated node suffixes are rejected unless a separate current spec declares an explicit import path.
- [ ] State and projection behavior are derived from source records and evidence providers, not stored command state.

---

## Decomposition intent: versioned filename grammar

[`26-filename-grammar.adr.md`](26-filename-grammar.adr.md) (audit-APPROVED) makes the spec-tree library the canonical owner of the versioned Spec-Tree filename grammar. The new capability to structure under this node:

- **Grammar registry + naming version.** All filename grammar tokens — kind and product suffixes, evidence modes, levels, language tails, the runner token, segment/order separators, the order pattern, coordination-note names, eval-lane names — single-sourced in the library `as const` registry surface (extending the kind registry, per `21-kind-registry.adr.md`), plus a dedicated naming-schema version and an ordered set of prior-version schemas. No codegen; hand-authored `as const`.
- **Version-aware recognition.** The recognizer classifies every filesystem name valid (canonical schema) / superseded (a prior version, named) / invalid (no version). It accepts the schema set and a filesystem record as parameters (DI, no mocking).
- **Residual retention.** The reader and snapshot retain every name the recognizer classifies as neither valid nor superseded, so the invalid set is the complement of recognition — no second traversal.

Decomposition outcome: the versioned grammar is extracted as the child enabler [`29-filename-grammar.enabler`](29-filename-grammar.enabler/filename-grammar.md), consolidating the kind-registry vocabulary (its mapping/property/single-source assertions and their tests moved in) with the new versioned-grammar assertions (full-grammar single-sourcing, ordered schema versions, dedicated naming version).

Implemented across all four children: `29-filename-grammar.enabler` single-sources the grammar vocabulary plus the ordered semver naming-schema versions and the dedicated naming version; `43-entry-recognition.enabler` classifies ordered node directories valid / superseded / invalid against the injected version set ([`43-entry-recognition.enabler/21-recognition-classification.adr.md`](43-entry-recognition.enabler/21-recognition-classification.adr.md)); `32-spec-tree-source.enabler` retains the superseded entries and the invalid residual on the snapshot; `54-spec-tree-assembly.enabler` carries both distinct from the assembled valid tree. The subtree is in the passing gate (removed from `spx/EXCLUDE`).

Out of scope for this node: the grammar emit command (`spx spec` surface under `spx/31-spec-domain.enabler`) and the shared multi-format reporter factoring — separate downstream work the ADR governs but this node does not own.

## Follow-ups

- **Recognizer as skill-conformance oracle (new spec).** Extend recognition beyond ordered node directories to every Spec-Tree-skill-authored file form — spec files (`{slug}.md` matching the parent node slug), coordination notes (`PLAN.md`/`ISSUES.md`), eval-lane files under `evals/{rule}/`, `EXCLUDE` — classifying them valid and any foreign name invalid, with the context-dependent placement rules. This exceeds the current 43/32/54 specs (which enumerate only product / node / decision / evidence forms) and is declared product truth, so it needs its own spec assertions plus an `[eval]` that runs a skill and scores whether it only produced grammar-valid files. Author before implementing.
- **Verify and clear the first [`ISSUES.md`](ISSUES.md) entry.** The compiled `dist` TypeScript architecting skills now describe the canonical decision-first ADR template the entry claims they contradict; confirm the `~/Code/outcomeeng/plugins` source matches and clear the entry if so.
- [x] **Kind-vocabulary import surface.** `src/lib/spec-tree/index.ts` re-exports the registry and grammar vocabulary, and consumers import those contracts through `@/lib/spec-tree`.
