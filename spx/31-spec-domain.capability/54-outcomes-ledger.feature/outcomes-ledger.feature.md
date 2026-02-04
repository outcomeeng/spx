# Feature: outcomes.yaml Ledger

## Purpose

Parse, validate, and generate outcomes.yaml files that provide machine-verifiable proof linking specs to test evidence.

**Depends on**: 43-naming-parsing (needs to resolve container paths from parsed names)

## Requirements

### Ledger Format

Parse YAML structure:

```yaml
spec_blob: a3f2b7c...
committed_at: 2026-01-28T14:15:00Z
tests:
  - file: parsing.unit.test.ts
    blob: 1f2e...
    passed_at: 2026-01-27T10:30:00Z
  - file: cli.integration.test.ts
    blob: 9ac4...
    passed_at: 2026-01-28T14:15:00Z
```

Fields:

- `spec_blob`: Git blob SHA of spec file when committed
- `committed_at`: ISO 8601 timestamp of commit operation
- `file`: Filename relative to `tests/` directory (prefix never stored)
- `blob`: Git blob SHA of test file when it passed
- `passed_at`: ISO 8601 timestamp when test passed

### Git Blob Integration

Compute git blob SHAs for:

- Spec files (to detect staleness)
- Test files (to detect modifications)

Use `git hash-object` or equivalent for deterministic blob computation.

### Path Derivation

For each `file` in `tests` array, derive the runnable path as:

```
<container>/tests/<file>
```

The `tests/` prefix is never stored in outcomes.yaml.

### Ledger Validation

Validate ledger integrity:

- All `file` entries must exist at `<container>/tests/<file>`
- `spec_blob` must match current spec file (or report stale)
- `blob` must match current test file (or report stale)

## Test Strategy

| Component           | Level | Harness | Rationale                       |
| ------------------- | ----- | ------- | ------------------------------- |
| YAML parsing        | 1     | -       | Pure YAML parsing               |
| Field extraction    | 1     | -       | Pure object access              |
| Blob computation    | 2     | cli     | Needs git repository            |
| Staleness detection | 2     | cli     | Needs real files for comparison |

### Escalation Rationale

- **1 → 2**: Level 1 proves YAML parsing; Level 2 confirms git blob computation works with real repos

## Outcomes

### 1. Parse outcomes.yaml structure

```gherkin
GIVEN an outcomes.yaml with spec_blob and tests array
WHEN parsing the ledger
THEN spec_blob is extracted correctly
AND committed_at timestamp is parsed as ISO 8601
AND all test entries are parsed with file, blob, passed_at
```

| File                                                 | Level | Harness |
| ---------------------------------------------------- | ----- | ------- |
| [yaml-parsing.unit](tests/yaml-parsing.unit.test.ts) | 1     | -       |

---

### 2. Detect phantom test entries

```gherkin
GIVEN an outcomes.yaml with entry "foo.unit.test.ts"
AND no file exists at tests/foo.unit.test.ts
WHEN validating the ledger
THEN phantom error is reported for "foo.unit.test.ts"
```

| File                                                         | Level | Harness |
| ------------------------------------------------------------ | ----- | ------- |
| [phantom-detection.int](tests/phantom-detection.int.test.ts) | 2     | cli     |

---

### 3. Detect stale spec blob

```gherkin
GIVEN an outcomes.yaml with spec_blob "abc123"
AND current spec file has blob "def456"
WHEN validating the ledger
THEN stale spec is reported
AND re-commit is suggested
```

| File                                                     | Level | Harness |
| -------------------------------------------------------- | ----- | ------- |
| [stale-detection.int](tests/stale-detection.int.test.ts) | 2     | cli     |

---

### 4. Generate outcomes.yaml from test results

```gherkin
GIVEN a container with tests/ directory
AND some tests pass and some fail
WHEN running commit operation
THEN outcomes.yaml is generated
AND only passing tests are recorded
AND spec_blob matches current spec file
AND committed_at reflects current timestamp
```

| File                                                         | Level | Harness |
| ------------------------------------------------------------ | ----- | ------- |
| [commit-generation.int](tests/commit-generation.int.test.ts) | 2     | cli     |

## Architectural Constraints

| ADR       | Constraint                                         |
| --------- | -------------------------------------------------- |
| (pending) | outcomes.yaml as sole source of truth for evidence |
| (pending) | Blob-based comparison over timestamp comparison    |
| (pending) | YAML format over CSV for structured data           |
