# Structural Normalization Plan: Legacy Capability Subtrees

Three top-level subtrees use pre-methodology node suffixes. This plan executes the bottom-up normalization: `.story` first, then `.feature`, then `.capability`.

**Key rule:** This is a proper spec-tree refactoring, not just renaming. Each node must be audited (is it a real enabler or outcome? is the name a junk-drawer?), its spec rewritten (PROVIDES/SO THAT/CAN for enablers), and the code verified to still be wired into the CLI. Surface unwired items at end of each session.

**Order within each session:**

1. Rename all `.story` dirs within a parent to `.enabler` (git mv dir, git mv spec file from `{slug}.story.md` to `{slug}.md`, rewrite spec content)
2. Then rename the parent `.feature` dir to `.enabler`
3. Repeat until all `.feature` dirs are done
4. Then rename the `.capability` root (use `/spec-tree:refactoring` — type may be `.enabler` or `.outcome` depending on audit)

---

## Subtree 1: `21-core-cli.capability/`

**Stories to normalize (30 total):**

Under `21-pattern-matching.feature/`:

- `21-parse-capability-names.story`
- `32-parse-feature-names.story`
- `43-parse-story-names.story`
- `54-validate-bsp-numbers.story`
- `65-test-factories.story`

Under `32-directory-walking.enabler/` (parent already renamed):

- `21-recursive-walk.story`
- `32-pattern-filter.story`
- `43-build-work-item-list.story`
- `54-edge-cases.story`

Under `43-status-determination.feature/`:

- `21-state-machine.story`
- `32-detect-tests-dir.story`
- `43-parse-done-md.story`
- `54-status-edge-cases.story`

Under `48-test-harness.enabler/` (parent already renamed):

- `21-context-manager.story`
- `32-fixture-integration.story`

Under `54-tree-building.enabler/` (parent already renamed):

- `21-parent-child-links.story`
- `32-bsp-sorting.story`
- `43-status-rollup.story`
- `54-tree-validation.story`

Under `65-output-formatting.enabler/` (parent already renamed):

- `21-text-formatter.story`
- `32-json-formatter.story`
- `43-markdown-formatter.story`
- `54-table-formatter.story`

Under `76-cli-integration.enabler/` (parent already renamed):

- `21-status-command.story`
- `32-next-command.story`
- `43-format-options.story`
- `54-error-handling.story`

Under `87-e2e-workflow.feature/`:

- `21-fixture-generator.story`
- `32-fixture-writer.story`
- `43-e2e-validation.story`

**Features remaining (3):**

- `21-pattern-matching.feature` → `.enabler` (after its 5 stories done)
- `43-status-determination.feature` → `.enabler` (after its 4 stories done)
- `87-e2e-workflow.feature` → `.enabler` (after its 3 stories done)

**Capability root:** `21-core-cli.capability` → audit with `/spec-tree:refactoring` for type (`.enabler` vs `.outcome`)

---

## Subtree 2: `26-scoped-cli.capability/`

**Stories to normalize (2):**

Under `21-domain-router.feature/`:

- `21-domain-router-infrastructure.story`
- `32-spec-domain-implementation.story`

**Features remaining (1):**

- `21-domain-router.feature` → `.enabler` (after its 2 stories done)

**Capability root:** `26-scoped-cli.capability` → audit with `/spec-tree:refactoring`

---

## Subtree 3: `31-spec-domain.capability/`

**Note:** This subtree has a BSP collision with `31-spec-domain.enabler/` (same index, same slug). The collision must be resolved as part of the capability audit — one must be dissolved into the other. See `spx/ISSUES.md` for the full classification needed.

**Stories to normalize (0):** No `.story` dirs under this capability.

**Features remaining (6):**

- `21-configurable-hierarchy.feature`
- `32-container-model.feature`
- `43-naming-parsing.feature`
- `54-outcomes-ledger.feature`
- `65-status-derivation.feature`
- `76-cli-commands.feature`

**Capability root:** `31-spec-domain.capability` — requires BSP collision resolution first. Invoke `/spec-tree:refactoring` to dissolve into or merge with `31-spec-domain.enabler`.

---

## Execution Order

Process subtrees in index order (smaller index = more dependencies):

1. `21-core-cli.capability/` — stories first (bottom-up within), then features, then capability
2. `26-scoped-cli.capability/` — same order
3. `31-spec-domain.capability/` — resolve BSP collision first, then features, then capability

Skills: `/spec-tree:understanding` → `/spec-tree:contextualizing spx/{subtree}` → `/spec-tree:refactoring`
