# Feature: Configurable Hierarchy

## Purpose

Load, validate, and resolve configuration that defines the spec tree structure. All container types, hierarchy depth, and decision document types are configurable—not hardcoded.

This is the foundation feature. Every other feature in this capability depends on configuration being available.

## Requirements

### Configuration Schema

Support `spx.config.yaml` with this structure:

```yaml
hierarchy:
  root: spx/ # Root directory for spec tree
  levels: # Ordered outermost → innermost
    - name: capability
      suffix: .capability
    - name: feature
      suffix: .feature
    - name: story
      suffix: .story

decisions:
  - name: adr
    suffix: .adr

product:
  spec: product.prd.md # Product-level requirements doc
```

### Validation Constraints

At load time, enforce:

- All suffixes start with `.`
- No suffix collisions between levels and decisions
- At least one hierarchy level defined
- Names are unique within their category
- Suffixes are unique globally

### Resolution Chain

Resolve configuration in order:

1. `--config` flag (explicit path)
2. `spx.config.yaml` in current directory
3. `spx.config.yaml` in repository root
4. Built-in defaults (CODE framework)

### Built-in Defaults

When no config file exists, use CODE framework defaults:

- Levels: capability → feature → story
- Decisions: adr
- Root: `spx/`
- Product spec: `product.prd.md`

## Test Strategy

| Component         | Level | Harness | Rationale                 |
| ----------------- | ----- | ------- | ------------------------- |
| Schema types      | 1     | -       | Pure TypeScript types     |
| YAML parsing      | 1     | -       | Pure parsing, mock input  |
| Constraint checks | 1     | -       | Pure validation logic     |
| Resolution chain  | 2     | cli     | Needs real filesystem     |
| Default fallback  | 1     | -       | Pure logic with no config |

### Escalation Rationale

- **1 → 2**: Level 1 proves parsing and validation logic; Level 2 confirms filesystem resolution works correctly

## Outcomes

### 1. Valid config is loaded and parsed

```gherkin
GIVEN a valid spx.config.yaml with 3 hierarchy levels
WHEN loading configuration
THEN all levels are parsed in order
AND each level has name and suffix
AND decisions array is parsed
AND product.spec is parsed
```

| File                                                     | Level | Harness |
| -------------------------------------------------------- | ----- | ------- |
| [config-loading.unit](tests/config-loading.unit.test.ts) | 1     | -       |

---

### 2. Invalid suffix is rejected

```gherkin
GIVEN a config with suffix "capability" (missing dot)
WHEN validating configuration
THEN validation fails
AND error identifies the invalid suffix
```

| File                                                           | Level | Harness |
| -------------------------------------------------------------- | ----- | ------- |
| [config-validation.unit](tests/config-validation.unit.test.ts) | 1     | -       |

---

### 3. Suffix collision is rejected

```gherkin
GIVEN a config where hierarchy level and decision share suffix ".adr"
WHEN validating configuration
THEN validation fails
AND error identifies the collision
```

| File                                                           | Level | Harness |
| -------------------------------------------------------------- | ----- | ------- |
| [config-validation.unit](tests/config-validation.unit.test.ts) | 1     | -       |

---

### 4. Resolution chain finds correct config

```gherkin
GIVEN spx.config.yaml in repository root
AND no config in current directory
AND no --config flag
WHEN resolving configuration
THEN repository root config is used
```

| File                                                         | Level | Harness |
| ------------------------------------------------------------ | ----- | ------- |
| [config-resolution.int](tests/config-resolution.int.test.ts) | 2     | cli     |

---

### 5. Missing config falls back to defaults

```gherkin
GIVEN no spx.config.yaml exists anywhere
WHEN resolving configuration
THEN CODE framework defaults are used
AND hierarchy has capability/feature/story
AND decisions has adr
```

| File                                                       | Level | Harness |
| ---------------------------------------------------------- | ----- | ------- |
| [config-defaults.unit](tests/config-defaults.unit.test.ts) | 1     | -       |

---

### 6. Config flag overrides all

```gherkin
GIVEN --config /custom/path.yaml flag
AND spx.config.yaml exists in repository root
WHEN resolving configuration
THEN /custom/path.yaml is used
AND repository root config is ignored
```

| File                                                         | Level | Harness |
| ------------------------------------------------------------ | ----- | ------- |
| [config-resolution.int](tests/config-resolution.int.test.ts) | 2     | cli     |

## Architectural Constraints

| ADR       | Constraint                                            |
| --------- | ----------------------------------------------------- |
| (pending) | YAML format for human-readable configuration          |
| (pending) | Resolution chain order: flag → local → root → default |
| (pending) | Suffixes must start with dot for unambiguous parsing  |
