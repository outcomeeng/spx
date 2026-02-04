# Capability 31: Spec Domain

CLI commands for managing configurable spec trees with outcome-based verification.

## Quick Reference

| Document                                             | Purpose                                       |
| ---------------------------------------------------- | --------------------------------------------- |
| [configuration-schema](docs/configuration-schema.md) | Config file format, hierarchy/decision types  |
| [container-model](docs/container-model.md)           | Tree structure, leaf vs non-leaf, traversal   |
| [naming-conventions](docs/naming-conventions.md)     | Regex patterns, parsing `{BSP}-{slug}.{type}` |
| [bsp-algorithms](docs/bsp-algorithms.md)             | Insert/append/sort calculations               |
| [container-states](docs/container-states.md)         | State derivation, rollup, transitions         |
| [outcomes-yaml](docs/outcomes-yaml.md)               | Ledger format, blob references, tree coupling |
| [validation-rules](docs/validation-rules.md)         | Phantom/regression/stale detection            |

---

## Task-Based Routing

### Implementing `spx create`

Create new containers with correct BSP numbering.

```
Read order:
1. configuration-schema.md  → what types are configured
2. naming-conventions.md    → how to generate valid names
3. bsp-algorithms.md        → how to calculate next BSP
```

### Implementing `spx status`

Display tree with container states.

```
Read order:
1. container-model.md       → how to traverse the tree
2. container-states.md      → how to derive state from ledger
3. outcomes-yaml.md         → how to read ledger format
```

### Implementing `spx next`

Find the next incomplete work item.

```
Read order:
1. container-model.md       → depth-first traversal algorithm
2. container-states.md      → which states mean "incomplete"
3. bsp-algorithms.md        → how to sort siblings by BSP
```

### Implementing `spx claim`

Assert tests pass and update ledger.

```
Read order:
1. outcomes-yaml.md         → ledger format and tree coupling
2. validation-rules.md      → what to check before claiming
3. container-states.md      → how state changes after claim
```

### Implementing `spx validate`

Precommit validation without running tests.

```
Read order:
1. validation-rules.md      → phantom/regression/stale rules
2. container-states.md      → how to detect regressions
3. outcomes-yaml.md         → blob comparison for staleness
```

### Implementing `spx verify`

Run claimed tests to detect regressions.

```
Read order:
1. validation-rules.md      → verification vs validation
2. outcomes-yaml.md         → which tests to run (claimed only)
```

### Implementing `spx test`

Run all tests without modifying ledger.

```
Read order:
1. container-model.md       → how to find tests/ directory
2. naming-conventions.md    → test file naming patterns
```

---

## Doc Dependencies

```
configuration-schema ← standalone, read first if unfamiliar
       │
       ▼
naming-conventions ──► container-model
       │                    │
       ▼                    ▼
bsp-algorithms        outcomes-yaml
                           │
                           ▼
                    container-states
                           │
                           ▼
                    validation-rules
```

**Dependency meaning**: If doc A points to doc B, understanding A helps with B.

---

## Key Design Decisions

### Everything is Configurable

Container types (`capability`, `feature`, `story`), hierarchy depth, and decision types (`adr`) are all configuration — not hardcoded. The CLI is a generic spec tree manager.

See: [configuration-schema.md](docs/configuration-schema.md)

### Test Level is Orthogonal to Container Type

A story can have Level 1, 2, or 3 tests. A capability can have Level 1 tests. Test level depends on what the test needs (I/O, dependencies), not container type.

### States Communicate Required Action

States are named for what needs to happen, not the situation:

- **Unknown** → Write tests
- **Pending** → Fix code or claim
- **Stale** → Re-claim
- **Passing** → None
- **Regressed** → Investigate and fix

See: [container-states.md](docs/container-states.md)

---

## Start Here

**New to this capability?** Read in this order:

1. [configuration-schema.md](docs/configuration-schema.md) — understand what's configurable
2. [container-model.md](docs/container-model.md) — understand the tree structure
3. Then jump to task-based routing above for your specific command
