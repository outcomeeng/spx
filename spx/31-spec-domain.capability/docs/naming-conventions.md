# Naming Conventions

All containers and decisions follow predictable naming patterns. The CLI parses these patterns to extract BSP, slug, and type.

## Directory Naming

### Pattern

```
{BSP}-{slug}.{type}/
```

| Component | Description                                          | Examples                         |
| --------- | ---------------------------------------------------- | -------------------------------- |
| `{BSP}`   | Two digits (10-99), with `@` for recursive insertion | `21`, `20@54`, `20@54@32`        |
| `-`       | Separator (hyphen, ASCII 45)                         | `-`                              |
| `{slug}`  | Human-readable name (lowercase, hyphens allowed)     | `core-cli`, `auth`, `login-flow` |
| `.`       | Type delimiter                                       | `.`                              |
| `{type}`  | Configured container suffix (without dot)            | `capability`, `feature`, `story` |

### Regex

```regex
^(\d{2}(?:@\d{2})*)−([a-z][a-z0-9-]*)\.([a-z]+)$
```

Capture groups:

1. BSP (e.g., `21` or `20@54`)
2. Slug (e.g., `core-cli`)
3. Type (e.g., `capability`)

### Examples

| Directory Name                  | BSP        | Slug                | Type         |
| ------------------------------- | ---------- | ------------------- | ------------ |
| `21-core-cli.capability/`       | `21`       | `core-cli`          | `capability` |
| `32-directory-walking.feature/` | `32`       | `directory-walking` | `feature`    |
| `20@54-audit.feature/`          | `20@54`    | `audit`             | `feature`    |
| `20@54@32-trace.story/`         | `20@54@32` | `trace`             | `story`      |

## Spec File Naming

### Pattern

```
{slug}.{type}.md
```

The spec file lives inside the container directory. BSP is **not** in the filename — this allows renumbering without file renames.

### Examples

| Container                 | Spec File                |
| ------------------------- | ------------------------ |
| `21-core-cli.capability/` | `core-cli.capability.md` |
| `32-auth.feature/`        | `auth.feature.md`        |
| `54-login.story/`         | `login.story.md`         |

### Regex

```regex
^([a-z][a-z0-9-]*)\.([a-z]+)\.md$
```

## Decision File Naming

### Pattern

```
{BSP}-{slug}.{decision-type}.md
```

Decisions are flat files (not directories) that share the BSP number space with containers.

### Examples

| Decision File             | BSP  | Slug            | Type  |
| ------------------------- | ---- | --------------- | ----- |
| `21-auth-strategy.adr.md` | `21` | `auth-strategy` | `adr` |
| `37-rate-limiting.rfc.md` | `37` | `rate-limiting` | `rfc` |

### Regex

```regex
^(\d{2}(?:@\d{2})*)−([a-z][a-z0-9-]*)\.([a-z]+)\.md$
```

## ASCII Sort Order

The hyphen (`-`) separator is chosen because it sorts before `@` in ASCII:

| Character    | ASCII Code | Sort Position     |
| ------------ | ---------- | ----------------- |
| `-` (hyphen) | 45         | First (parent)    |
| `0-9`        | 48-57      | Second (siblings) |
| `@` (at)     | 64         | Third (children)  |

This ensures parents sort before their recursive children:

```
20-auth.capability/       ← Parent (- at position 45)
20@50-mfa.feature/        ← Child (@ at position 64)
21-billing.capability/    ← Next sibling
```

## Slug Rules

| Rule                          | Valid        | Invalid      |
| ----------------------------- | ------------ | ------------ |
| Lowercase letters             | `auth`       | `Auth`       |
| Hyphens for word separation   | `core-cli`   | `core_cli`   |
| Numbers allowed (not leading) | `oauth2`     | `2factor`    |
| No special characters         | `login-flow` | `login.flow` |

### Slug Regex

```regex
^[a-z][a-z0-9-]*$
```

## Type Validation

The CLI validates that parsed types match configured suffixes:

```typescript
function isValidType(type: string, config: Config): boolean {
  const allTypes = [
    ...config.hierarchy.levels.map(l => l.suffix.slice(1)),
    ...config.decisions.map(d => d.suffix.slice(1)),
  ];
  return allTypes.includes(type);
}
```

## Parsing Implementation

```typescript
interface ParsedName {
  bsp: string;
  slug: string;
  type: string;
}

function parseDirectoryName(name: string): ParsedName | null {
  const match = name.match(/^(\d{2}(?:@\d{2})*)-([a-z][a-z0-9-]*)\.([a-z]+)$/);
  if (!match) return null;
  return {
    bsp: match[1],
    slug: match[2],
    type: match[3],
  };
}

function parseSpecFileName(name: string): { slug: string; type: string } | null {
  const match = name.match(/^([a-z][a-z0-9-]*)\.([a-z]+)\.md$/);
  if (!match) return null;
  return {
    slug: match[1],
    type: match[2],
  };
}
```

## Invalid Patterns

| Pattern              | Problem                      |
| -------------------- | ---------------------------- |
| `capability-21_foo/` | Wrong order, underscore      |
| `21_foo.capability/` | Underscore instead of hyphen |
| `foo.capability/`    | Missing BSP                  |
| `21-foo/`            | Missing type                 |
| `21-Foo.capability/` | Uppercase in slug            |
| `21-.capability/`    | Empty slug                   |
