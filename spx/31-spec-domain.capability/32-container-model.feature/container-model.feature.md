# Feature: Container Model

## Purpose

Provide generic tree operations that work with any configured hierarchy. Containers are directories that match configured suffixes—the model doesn't assume specific types like "capability" or "story".

**Depends on**: 21-configurable-hierarchy (needs config to know what suffixes define containers)

## Requirements

### Container Detection

A directory is a container if:

1. Its name matches pattern `{BSP}-{slug}.{suffix}/`
2. The `{suffix}` appears in `hierarchy.levels[].suffix` from config

Non-matching directories are ignored during tree traversal.

### Hierarchy Level

Determine a container's level (0-indexed depth) by matching its suffix against the ordered `hierarchy.levels` array:

```
capability → level 0 (outermost)
feature    → level 1
story      → level 2 (innermost in 3-level config)
```

Level is used for:

- Determining valid child types (level N can contain level N+1)
- Identifying leaf containers (no further nesting allowed)

### Leaf Determination

A container is a **leaf** if its level equals `hierarchy.levels.length - 1` (the innermost configured level).

Leaf containers:

- Cannot contain child containers
- Are the atomic units of work
- Have their own `outcomes.yaml` ledger

Non-leaf containers:

- Can contain child containers at the next level
- Derive status from children (rollup)
- May also have their own tests and ledger

### Tree Traversal

Support two traversal modes:

**Depth-first** (for finding work):

```
capability-21/
  feature-21/
    story-21/  ← visit first
    story-32/  ← visit second
  feature-32/
    story-21/  ← visit third
```

**Bottom-up** (for status rollup):

```
story-21/      ← process first
story-32/      ← process second
feature-21/    ← derive from children
feature-32/
  story-21/    ← process
feature-32/    ← derive from child
capability-21/ ← derive from children
```

### Container Identity

Containers are identified by their full path from the spec root:

```
31-spec-domain.capability/21-configurable-hierarchy.feature/
```

Never use just the slug or BSP—always the full path for unambiguous reference.

## Test Strategy

| Component           | Level | Harness | Rationale                      |
| ------------------- | ----- | ------- | ------------------------------ |
| Container detection | 1     | -       | Pure suffix matching           |
| Level calculation   | 1     | -       | Pure array index lookup        |
| Leaf determination  | 1     | -       | Pure comparison                |
| Depth-first walk    | 2     | cli     | Needs real directory structure |
| Bottom-up walk      | 2     | cli     | Needs real directory structure |

### Escalation Rationale

- **1 → 2**: Level 1 proves detection and calculation logic; Level 2 confirms traversal works with real filesystem

## Outcomes

### 1. Directory is identified as container

```gherkin
GIVEN config with hierarchy level suffix ".capability"
AND directory named "21-core-cli.capability"
WHEN checking if directory is a container
THEN result is true
AND container type is "capability"
```

| File                                                               | Level | Harness |
| ------------------------------------------------------------------ | ----- | ------- |
| [container-detection.unit](tests/container-detection.unit.test.ts) | 1     | -       |

---

### 2. Non-container directory is ignored

```gherkin
GIVEN config with hierarchy levels [capability, feature, story]
AND directory named "docs" (no suffix match)
WHEN checking if directory is a container
THEN result is false
```

| File                                                               | Level | Harness |
| ------------------------------------------------------------------ | ----- | ------- |
| [container-detection.unit](tests/container-detection.unit.test.ts) | 1     | -       |

---

### 3. Container level is calculated correctly

```gherkin
GIVEN config with levels [capability, feature, story]
AND container with suffix ".feature"
WHEN calculating hierarchy level
THEN level is 1
```

| File                                                       | Level | Harness |
| ---------------------------------------------------------- | ----- | ------- |
| [hierarchy-level.unit](tests/hierarchy-level.unit.test.ts) | 1     | -       |

---

### 4. Leaf container is identified

```gherkin
GIVEN config with 3 levels [capability, feature, story]
AND container at level 2 (story)
WHEN checking if container is leaf
THEN result is true
```

| File                                                     | Level | Harness |
| -------------------------------------------------------- | ----- | ------- |
| [leaf-detection.unit](tests/leaf-detection.unit.test.ts) | 1     | -       |

---

### 5. Depth-first traversal visits in correct order

```gherkin
GIVEN a tree with capability containing 2 features, each with 2 stories
WHEN traversing depth-first
THEN stories are visited before their parent features
AND features are visited before their parent capability
AND siblings are visited in BSP order
```

| File                                                   | Level | Harness |
| ------------------------------------------------------ | ----- | ------- |
| [tree-traversal.int](tests/tree-traversal.int.test.ts) | 2     | cli     |

---

### 6. Bottom-up traversal enables rollup

```gherkin
GIVEN a tree with nested containers
WHEN traversing bottom-up
THEN leaf containers are visited first
AND parent containers are visited after all children
```

| File                                                   | Level | Harness |
| ------------------------------------------------------ | ----- | ------- |
| [tree-traversal.int](tests/tree-traversal.int.test.ts) | 2     | cli     |

## Architectural Constraints

| ADR       | Constraint                                              |
| --------- | ------------------------------------------------------- |
| (pending) | Full path as container identity (no ambiguous slugs)    |
| (pending) | Level determined by config order, not naming convention |
| (pending) | Leaf status derived from config depth, not heuristics   |
