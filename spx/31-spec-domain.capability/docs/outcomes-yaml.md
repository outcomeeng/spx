# Outcome Ledger (outcomes.yaml)

The outcome ledger records verification state for a container. It answers: "Did this content pass tests, and when?"

## Purpose

Git provides cryptographic integrity of content (a Merkle tree of blobs). The outcome ledger provides **verification state** — a separate Merkle tree tracking which tests pass and how containers relate.

## Format

```yaml
tests:
  - file: login.unit.test.ts
    passed_at: 2026-01-28T14:15:00Z
  - file: login.integration.test.ts
    passed_at: 2026-01-28T14:15:00Z
descendants:
  - path: 10-parse-credentials.story/
    outcomes_blob: a3f2b7c
  - path: 22-validate-token.story/
    outcomes_blob: 9bc4e1d
```

## Schema

### `tests[]`

List of test files that have been claimed as passing.

| Field       | Type   | Description                                      |
| ----------- | ------ | ------------------------------------------------ |
| `file`      | string | Test filename (relative to container's `tests/`) |
| `passed_at` | string | ISO 8601 timestamp when test was claimed         |

**Path derivation**: For each `file`, the full path is `{container}/tests/{file}`.

The `tests/` prefix is never stored — it's always derived.

### `descendants[]`

List of child containers with their ledger blob references.

| Field           | Type   | Description                             |
| --------------- | ------ | --------------------------------------- |
| `path`          | string | Child container directory name          |
| `outcomes_blob` | string | Git blob SHA of child's `outcomes.yaml` |

**Staleness detection**: If `outcomes_blob` doesn't match the current blob of the child's ledger, this container is **Stale**.

## Tree Coupling

Parent ledgers reference child ledgers via `outcomes_blob`. This creates a Merkle tree of verification state:

```
capability/outcomes.yaml
  └── descendants[0].outcomes_blob → feature-1/outcomes.yaml
      └── descendants[0].outcomes_blob → story-1/outcomes.yaml
```

When a child's ledger changes:

1. Child's Git blob SHA changes
2. Parent's stored `outcomes_blob` no longer matches
3. Parent becomes **Stale**
4. Parent must re-claim to update references

## Commands

### `spx test [container]`

Run tests without modifying the ledger.

```bash
spx test path/to/container/
# Runs all tests in container's tests/ directory
# Reports pass/fail but doesn't update outcomes.yaml
```

### `spx claim [container]`

Assert tests pass and update the ledger.

```bash
spx claim path/to/container/
# 1. Run all tests
# 2. If all pass: update outcomes.yaml with timestamps
# 3. If any fail: error, cannot claim
```

With `--tree` flag, claims bottom-up:

```bash
spx claim path/to/container/ --tree
# 1. Claim all descendant containers (recursively)
# 2. Then claim this container (which updates descendant blobs)
```

### `spx verify [container]`

Check that claims still hold.

```bash
spx verify path/to/container/
# Run only tests listed in outcomes.yaml
# Report: Passing or Regressed
```

### `spx status [container]`

Show state without running tests.

```bash
spx status path/to/container/
# Compute state from ledger and blobs
# Does NOT execute tests
```

## Ledger Operations

### Creating a Ledger

```typescript
interface OutcomesYaml {
  tests: Array<{ file: string; passed_at: string }>;
  descendants: Array<{ path: string; outcomes_blob: string }>;
}

function createLedger(container: Container): OutcomesYaml {
  const tests = findPassingTests(container);
  const now = new Date().toISOString();

  return {
    tests: tests.map(file => ({ file, passed_at: now })),
    descendants: findChildContainers(container).map(child => ({
      path: child.name,
      outcomes_blob: gitBlobOf(`${child.path}/outcomes.yaml`),
    })),
  };
}
```

### Updating a Ledger

When re-claiming:

```typescript
function updateLedger(container: Container, existing: OutcomesYaml): OutcomesYaml {
  const currentTests = findPassingTests(container);
  const now = new Date().toISOString();

  // Preserve timestamps for unchanged tests
  const tests = currentTests.map(file => {
    const existing = existing.tests.find(t => t.file === file);
    return existing || { file, passed_at: now };
  });

  // Always refresh descendant blobs
  const descendants = findChildContainers(container).map(child => ({
    path: child.name,
    outcomes_blob: gitBlobOf(`${child.path}/outcomes.yaml`),
  }));

  return { tests, descendants };
}
```

### Reading a Ledger

```typescript
import { readFileSync } from "fs";
import { parse } from "yaml";

function loadLedger(containerPath: string): OutcomesYaml | null {
  const ledgerPath = `${containerPath}/outcomes.yaml`;
  try {
    const content = readFileSync(ledgerPath, "utf-8");
    return parse(content);
  } catch {
    return null;
  }
}
```

## Blob Computation

Git blob SHA is computed as:

```typescript
import { execSync } from "child_process";

function gitBlobOf(filePath: string): string {
  const result = execSync(`git hash-object "${filePath}"`, { encoding: "utf-8" });
  return result.trim().slice(0, 7); // Short SHA
}
```

For files not yet in git:

```typescript
function computeBlob(content: string): string {
  const header = `blob ${Buffer.byteLength(content)}\0`;
  const store = header + content;
  return crypto.createHash("sha1").update(store).digest("hex").slice(0, 7);
}
```

## Incomplete Ledgers

A ledger with fewer tests than exist in `tests/` is valid — it means work is in progress.

| Tests in `tests/` | Tests in ledger | State                       |
| ----------------- | --------------- | --------------------------- |
| 5                 | 0 (no ledger)   | Pending                     |
| 5                 | 3               | Pending                     |
| 5                 | 5               | Passing (if all still pass) |

## Never Hand-Edit

The ledger is **machine-generated**. Manual edits will:

- Create invalid timestamps
- Reference non-existent tests
- Break blob references

Always use `spx claim` to modify ledgers.

## Example Ledgers

### Leaf Container (Story)

```yaml
tests:
  - file: parse-args.unit.test.ts
    passed_at: 2026-01-28T10:30:00Z
  - file: validate-input.unit.test.ts
    passed_at: 2026-01-28T10:30:00Z
```

### Non-Leaf Container (Feature)

```yaml
tests:
  - file: auth-flow.integration.test.ts
    passed_at: 2026-01-28T14:15:00Z
descendants:
  - path: 21-login.story/
    outcomes_blob: a3f2b7c
  - path: 32-logout.story/
    outcomes_blob: 9bc4e1d
```

### Top-Level Container (Capability)

```yaml
tests:
  - file: full-workflow.e2e.test.ts
    passed_at: 2026-01-28T16:00:00Z
descendants:
  - path: 21-auth.feature/
    outcomes_blob: 4d5e6f7
  - path: 32-billing.feature/
    outcomes_blob: 8a9b0c1
```
