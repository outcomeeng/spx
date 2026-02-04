# Configuration Schema

The spec domain CLI is a generic tree manager. Container types, hierarchy depth, and decision document types are all configurable.

## Configuration File

Location: `spx.config.yaml` at repository root (or embedded in `spx/` directory).

```yaml
# spx.config.yaml
hierarchy:
  root: spx/ # Root directory for spec tree
  levels: # Ordered from outermost to innermost
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

## Schema Definition

### `hierarchy.root`

- **Type**: string (path)
- **Default**: `spx/`
- **Purpose**: Root directory containing the spec tree

### `hierarchy.levels[]`

Ordered list of container types, from outermost (broadest scope) to innermost (atomic).

| Field    | Type   | Required | Description                                 |
| -------- | ------ | -------- | ------------------------------------------- |
| `name`   | string | yes      | Human-readable type name                    |
| `suffix` | string | yes      | Directory/file suffix (must start with `.`) |

**Constraints**:

- At least 1 level required
- No maximum depth (but 2-4 typical)
- Names must be unique
- Suffixes must be unique

### `decisions[]`

List of decision document types that can appear at any level.

| Field    | Type   | Required | Description                       |
| -------- | ------ | -------- | --------------------------------- |
| `name`   | string | yes      | Human-readable type name          |
| `suffix` | string | yes      | File suffix (must start with `.`) |

**Constraints**:

- Decision suffixes must not collide with hierarchy suffixes
- Decisions are flat files (not directories)

### `product.spec`

- **Type**: string (filename)
- **Default**: `product.prd.md`
- **Purpose**: Product-level requirements document at tree root

## Example Configurations

### CODE Framework (Default)

```yaml
hierarchy:
  root: spx/
  levels:
    - name: capability
      suffix: .capability
    - name: feature
      suffix: .feature
    - name: story
      suffix: .story

decisions:
  - name: adr
    suffix: .adr
```

### Two-Level (Epic/Task)

```yaml
hierarchy:
  root: specs/
  levels:
    - name: epic
      suffix: .epic
    - name: task
      suffix: .task

decisions:
  - name: rfc
    suffix: .rfc
```

### Four-Level with Multiple Decision Types

```yaml
hierarchy:
  root: design/
  levels:
    - name: domain
      suffix: .domain
    - name: module
      suffix: .module
    - name: component
      suffix: .component
    - name: unit
      suffix: .unit

decisions:
  - name: adr
    suffix: .adr
  - name: rfc
    suffix: .rfc
  - name: tdr
    suffix: .tdr
```

## Runtime Resolution

The CLI resolves configuration in order:

1. `--config` flag (explicit path)
2. `spx.config.yaml` in current directory
3. `spx.config.yaml` in repository root
4. Built-in CODE framework defaults

## Validation Rules

At load time, the CLI validates:

- [ ] All suffixes start with `.`
- [ ] No suffix collisions between levels and decisions
- [ ] At least one hierarchy level defined
- [ ] Root directory exists (or will be created)
