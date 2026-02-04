# Feature: Naming & Parsing

## Purpose

Extract BSP, slug, and type from directory and file names using patterns derived from configuration. Parsing logic adapts to whatever suffixes are configured—it doesn't assume CODE framework vocabulary.

**Depends on**: 21-configurable-hierarchy (patterns built from config suffixes)

## Requirements

### Directory Name Parsing

Parse directories matching `{BSP}-{slug}.{suffix}/`:

- **BSP**: Two digits `10-99`, optionally with recursive insertion `NN@NN`
- **Separator**: Hyphen (`-`) between BSP and slug
- **Slug**: Alphanumeric with hyphens, human-readable name
- **Suffix**: Must match a configured `hierarchy.levels[].suffix`

Examples with CODE defaults:

```
21-core-cli.capability/     → BSP=21, slug="core-cli", type="capability"
32-directory-walking.feature/ → BSP=32, slug="directory-walking", type="feature"
20@54-audit.feature/        → BSP="20@54", slug="audit", type="feature"
```

### Spec File Parsing

Parse spec files matching `{slug}.{suffix}.md`:

- Slug matches directory slug
- Suffix matches directory suffix
- **BSP is NOT in filename** (allows renumbering without file renames)

Example: `core-cli.capability.md` inside `21-core-cli.capability/`

### Decision File Parsing

Parse decision files matching `{BSP}-{slug}.{decision-suffix}.md`:

- Decision suffix from `config.decisions[].suffix`
- BSP determines ordering among decisions at same level
- Can appear at any hierarchy level

Example: `21-blob-staleness.adr.md`

### BSP Parsing

Parse BSP values:

| Format         | Example    | Meaning                                 |
| -------------- | ---------- | --------------------------------------- |
| Simple         | `21`       | Standard two-digit                      |
| Recursive      | `20@54`    | Insert between 20 and 21 at position 54 |
| Deep recursive | `20@54@32` | Further subdivision                     |

### BSP Sorting

Sort containers by BSP:

1. Compare integer prefix
2. For same prefix, non-recursive comes before recursive
3. For recursive, compare recursively

Example order: `20`, `20@32`, `20@54`, `21`, `32`

### Invalid Pattern Rejection

Reject and report errors for:

- Missing BSP: `foo.capability/`
- Missing suffix: `21-foo/`
- Invalid separator: `21_foo.capability/` (underscore)
- Unknown suffix: `21-foo.unknown/`

## Test Strategy

| Component        | Level | Harness | Rationale                  |
| ---------------- | ----- | ------- | -------------------------- |
| BSP parsing      | 1     | -       | Pure regex/arithmetic      |
| Slug extraction  | 1     | -       | Pure string parsing        |
| Type detection   | 1     | -       | Pure suffix matching       |
| Recursive BSP    | 1     | -       | Pure string/number parsing |
| BSP sorting      | 1     | -       | Pure comparison logic      |
| Decision parsing | 1     | -       | Pure pattern matching      |
| Directory scan   | 2     | cli     | Needs real filesystem      |

### Escalation Rationale

- **1 → 2**: Level 1 proves all parsing logic; Level 2 confirms real directories are matched correctly

## Outcomes

### 1. Standard directory name is parsed

```gherkin
GIVEN config with suffix ".capability"
AND directory named "21-core-cli.capability"
WHEN parsing the directory name
THEN BSP is 21
AND slug is "core-cli"
AND type is "capability"
```

| File                                                 | Level | Harness |
| ---------------------------------------------------- | ----- | ------- |
| [name-parsing.unit](tests/name-parsing.unit.test.ts) | 1     | -       |

---

### 2. Recursive BSP is parsed correctly

```gherkin
GIVEN directory named "20@54-audit.feature"
WHEN parsing the directory name
THEN BSP is "20@54"
AND slug is "audit"
AND BSP sorts after "20" and before "21"
```

| File                                               | Level | Harness |
| -------------------------------------------------- | ----- | ------- |
| [bsp-parsing.unit](tests/bsp-parsing.unit.test.ts) | 1     | -       |

---

### 3. Containers are sorted by BSP

```gherkin
GIVEN containers with BSPs [32, 21, 20@54, 20]
WHEN sorting by BSP
THEN order is [20, 20@54, 21, 32]
```

| File                                               | Level | Harness |
| -------------------------------------------------- | ----- | ------- |
| [bsp-sorting.unit](tests/bsp-sorting.unit.test.ts) | 1     | -       |

---

### 4. Decision file is parsed

```gherkin
GIVEN config with decision suffix ".adr"
AND file named "21-blob-staleness.adr.md"
WHEN parsing the file name
THEN BSP is 21
AND slug is "blob-staleness"
AND type is "adr"
```

| File                                                         | Level | Harness |
| ------------------------------------------------------------ | ----- | ------- |
| [decision-parsing.unit](tests/decision-parsing.unit.test.ts) | 1     | -       |

---

### 5. Invalid patterns are rejected

```gherkin
GIVEN config with known suffixes
AND directory named "21_foo.capability" (underscore separator)
WHEN parsing the directory name
THEN parsing fails
AND error identifies invalid separator
```

Invalid patterns to test:

- `capability-21_foo/` (old format)
- `21_foo.capability/` (underscore separator)
- `foo.capability/` (missing BSP)
- `21-foo/` (missing suffix)
- `21-foo.unknown/` (unknown suffix)

| File                                                         | Level | Harness |
| ------------------------------------------------------------ | ----- | ------- |
| [invalid-patterns.unit](tests/invalid-patterns.unit.test.ts) | 1     | -       |

---

### 6. Spec file matches container

```gherkin
GIVEN container "21-core-cli.capability/"
AND file "core-cli.capability.md" inside it
WHEN validating spec file
THEN file is recognized as valid spec
AND slug matches container slug
```

| File                                                             | Level | Harness |
| ---------------------------------------------------------------- | ----- | ------- |
| [spec-file-matching.unit](tests/spec-file-matching.unit.test.ts) | 1     | -       |

## Architectural Constraints

| ADR       | Constraint                                       |
| --------- | ------------------------------------------------ |
| (pending) | Hyphen separator for BSP-slug (not underscore)   |
| (pending) | BSP in directory name only, not in spec filename |
| (pending) | Patterns derived from config, not hardcoded      |
