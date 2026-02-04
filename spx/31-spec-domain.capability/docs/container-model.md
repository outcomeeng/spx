# Container Model

The spec tree is a hierarchy of **containers**. Each container holds a spec file, optional tests, an outcome ledger, and child containers.

## Terminology

| Term          | Definition                                           |
| ------------- | ---------------------------------------------------- |
| **Container** | A directory representing a unit of work at any level |
| **Level**     | Position in hierarchy (0 = outermost, N = innermost) |
| **Leaf**      | Container at the innermost level (no children)       |
| **Non-leaf**  | Container that can have child containers             |
| **Decision**  | Flat file documenting an architectural decision      |

## Hierarchy Structure

Containers nest according to configured levels. Given a 3-level configuration:

```
{root}/
├── {product-spec}                    # Product requirements
├── {BSP}-{slug}.{level-0-suffix}/    # Level 0 container
│   ├── {slug}.{level-0-suffix}.md    # Spec file
│   ├── outcomes.yaml                 # Outcome ledger
│   ├── tests/                        # Container's tests
│   ├── {BSP}-{slug}.{decision}/      # Decision doc (flat file)
│   └── {BSP}-{slug}.{level-1-suffix}/# Level 1 container
│       ├── {slug}.{level-1-suffix}.md
│       ├── outcomes.yaml
│       ├── tests/
│       └── {BSP}-{slug}.{level-2-suffix}/  # Level 2 (leaf)
│           ├── {slug}.{level-2-suffix}.md
│           ├── outcomes.yaml
│           └── tests/
```

## Container Contents

Every container directory contains:

| Item               | Required | Description                              |
| ------------------ | -------- | ---------------------------------------- |
| `{slug}.{type}.md` | yes      | Spec file defining intent and outcomes   |
| `outcomes.yaml`    | no       | Outcome ledger (created when tests pass) |
| `tests/`           | no       | Directory containing test files          |
| Child containers   | no       | Nested containers (non-leaf only)        |
| Decision files     | no       | `{BSP}-{slug}.{decision}.md`             |

## Leaf vs Non-Leaf

**Leaf containers** (innermost level):

- Cannot have child containers
- Represent atomic, implementable units
- Tests prove the implementation works

**Non-leaf containers** (all other levels):

- Can have child containers
- Can also have their own tests (for integration/e2e)
- State rolls up from descendants

## Decision Documents

Decisions can appear at any level and are interleaved with containers in BSP order:

```
{level-0-container}/
├── 10-bootstrap.{level-1-suffix}/
├── 21-security-model.{decision}.md     # Decision at position 21
├── 22-authentication.{level-1-suffix}/ # Depends on decision 21
└── 37-authorization.{level-1-suffix}/
```

Decisions:

- Are flat files (not directories)
- Share the BSP number space with containers
- Block containers with higher BSP numbers

## Tree Properties

### Co-location

Each container holds everything needed to understand and verify it:

- Spec (what it should do)
- Tests (proof it works)
- Ledger (verification state)

No parallel directory trees. No global `tests/` or `docs/` directories.

### Durable Structure

The tree is the always-current product map. Containers don't move when "done" — they stay in place. State is tracked in the outcome ledger, not directory location.

### BSP Ordering

Siblings are ordered by BSP number. Lower BSP = dependency that higher BSP may rely on. See [bsp-algorithms.md](bsp-algorithms.md).

### Sibling-Unique Paths

BSP numbers are only unique among siblings. Always use full paths:

```
# Ambiguous (multiple containers could match)
story-54

# Unambiguous
21-core.capability/32-auth.feature/54-login.story
```

## Traversal

### Depth-First (Implementation Order)

For finding next work item:

1. Start at root
2. Find first incomplete container at level 0 (by BSP order)
3. Recurse into it, find first incomplete at level 1
4. Continue until reaching a leaf

### Bottom-Up (Verification Order)

For claiming outcomes:

1. Start at leaves
2. Verify leaf tests pass, update leaf ledger
3. Move to parent, verify its tests + check child ledger blobs
4. Continue until reaching root

## Container Identity

A container is identified by its **path from root**, not just its name:

```typescript
interface ContainerPath {
  segments: Array<{
    bsp: string; // "21" or "20@54"
    slug: string; // "core-cli"
    type: string; // configured suffix without dot
  }>;
}
```

Example path: `21-core.capability/32-auth.feature/54-login.story`

Parsed:

```json
{
  "segments": [
    { "bsp": "21", "slug": "core", "type": "capability" },
    { "bsp": "32", "slug": "auth", "type": "feature" },
    { "bsp": "54", "slug": "login", "type": "story" }
  ]
}
```
