# Validation Rules

Validation ensures the spec tree maintains integrity. Precommit is the primary feedback loop; CI is insurance.

## Validation Scenarios

| Scenario                          | Severity       | Action            |
| --------------------------------- | -------------- | ----------------- |
| Claimed test fails                | **Regression** | Block commit      |
| Test file in ledger doesn't exist | **Phantom**    | Block commit      |
| Descendant blob mismatch          | **Stale**      | Re-claim required |
| Test exists but not in ledger     | In progress    | Allow commit      |
| Container has no tests            | Unknown        | Allow commit      |

## Phantom Detection

A **phantom** is a test file listed in `outcomes.yaml` that no longer exists on disk.

### Detection

```typescript
function findPhantoms(container: Container): string[] {
  const ledger = loadLedger(container);
  if (!ledger) return [];

  const phantoms: string[] = [];
  for (const test of ledger.tests) {
    const fullPath = `${container.path}/tests/${test.file}`;
    if (!fileExists(fullPath)) {
      phantoms.push(test.file);
    }
  }
  return phantoms;
}
```

### Resolution

1. If test was intentionally deleted: re-claim without it
2. If test was accidentally deleted: restore it
3. Never manually edit `outcomes.yaml` to remove the phantom

## Regression Detection

A **regression** is a claimed test that now fails without spec/test modification.

### Detection

```typescript
function findRegressions(container: Container): string[] {
  const ledger = loadLedger(container);
  if (!ledger) return [];

  const regressions: string[] = [];
  for (const test of ledger.tests) {
    const fullPath = `${container.path}/tests/${test.file}`;
    if (fileExists(fullPath) && !testPasses(fullPath)) {
      regressions.push(test.file);
    }
  }
  return regressions;
}
```

### Resolution

1. Investigate what changed elsewhere in the codebase
2. Fix the root cause (not the test)
3. Re-claim to update timestamps

## Staleness Detection

A container is **stale** when its recorded descendant blobs don't match current blobs.

### Detection

```typescript
function isStale(container: Container): boolean {
  const ledger = loadLedger(container);
  if (!ledger?.descendants) return false;

  for (const ref of ledger.descendants) {
    const childLedgerPath = `${container.path}/${ref.path}/outcomes.yaml`;
    if (!fileExists(childLedgerPath)) continue;

    const actualBlob = gitBlobOf(childLedgerPath);
    if (actualBlob !== ref.outcomes_blob) {
      return true;
    }
  }
  return false;
}
```

### Resolution

Run `spx claim --tree` to update all descendant references bottom-up.

## Precommit Hook

### Installation

```bash
# In .git/hooks/pre-commit or via husky/lefthook
spx validate --staged
```

### Behavior

```typescript
interface ValidationResult {
  valid: boolean;
  phantoms: Array<{ container: string; file: string }>;
  regressions: Array<{ container: string; file: string }>;
  stale: string[];
}

function validateStaged(): ValidationResult {
  const staged = getStagedFiles();
  const containers = findAffectedContainers(staged);

  const result: ValidationResult = {
    valid: true,
    phantoms: [],
    regressions: [],
    stale: [],
  };

  for (const container of containers) {
    // Check phantoms
    const phantoms = findPhantoms(container);
    for (const file of phantoms) {
      result.phantoms.push({ container: container.path, file });
      result.valid = false;
    }

    // Check regressions (only for containers with ledgers)
    const ledger = loadLedger(container);
    if (ledger) {
      const regressions = findRegressions(container);
      for (const file of regressions) {
        result.regressions.push({ container: container.path, file });
        result.valid = false;
      }
    }

    // Check staleness
    if (isStale(container)) {
      result.stale.push(container.path);
      result.valid = false;
    }
  }

  return result;
}
```

### Output Format

```
spx validate --staged

❌ Validation failed

Phantoms (test file missing):
  - 21-auth.capability/22-login.feature/tests/old-test.unit.test.ts

Regressions (claimed test fails):
  - 21-auth.capability/22-login.feature/tests/login.unit.test.ts

Stale (descendant changed):
  - 21-auth.capability/

Run 'spx claim --tree' to fix staleness.
```

## CI Validation

CI runs full validation as insurance against bypassed precommit.

```bash
# In CI pipeline
spx verify --all
```

### Behavior

1. Find all containers with `outcomes.yaml`
2. Run all claimed tests
3. Report regressions
4. Exit non-zero if any failures

### CI Output

```
spx verify --all

Verifying 42 containers...

✓ 21-core.capability/ (3 tests)
✓ 21-core.capability/21-parser.feature/ (5 tests)
✗ 21-core.capability/32-scanner.feature/ (2/3 tests)
  REGRESSION: walk.integration.test.ts

Verification failed: 1 regression in 42 containers
```

## Validation Scopes

### Container Scope

```bash
spx validate path/to/container/
# Validate single container (no recursion)
```

### Tree Scope

```bash
spx validate path/to/container/ --tree
# Validate container and all descendants
```

### Full Scope

```bash
spx validate --all
# Validate entire spec tree
```

### Staged Scope

```bash
spx validate --staged
# Validate only containers affected by staged changes
```

## Validation vs Verification

| Command        | Runs Tests         | Checks Blobs | Use Case                |
| -------------- | ------------------ | ------------ | ----------------------- |
| `spx validate` | No                 | Yes          | Quick precommit check   |
| `spx verify`   | Yes (claimed only) | Yes          | CI regression detection |
| `spx test`     | Yes (all)          | No           | Development iteration   |

## Error Codes

| Code | Meaning                      |
| ---- | ---------------------------- |
| 0    | All validations pass         |
| 1    | Phantom detected             |
| 2    | Regression detected          |
| 3    | Staleness detected           |
| 4    | Multiple issues (bitwise OR) |

## Implementation Notes

### Performance

- Validation should complete in <100ms for typical trees
- Use blob comparison (not test execution) for staleness
- Cache git blob computations within a single validation run

### Parallelization

Container validation is independent — parallelize across containers:

```typescript
async function validateAll(): Promise<ValidationResult[]> {
  const containers = findAllContainers();
  return Promise.all(containers.map(validateContainer));
}
```

### Incremental Validation

For `--staged`, only validate containers where:

- `outcomes.yaml` is staged
- Any file in `tests/` is staged
- Spec file is staged
