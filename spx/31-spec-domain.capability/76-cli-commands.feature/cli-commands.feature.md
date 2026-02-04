# Feature: CLI Commands

## Purpose

Implement the `spx spx <command>` CLI interface for spec domain operations. Each command is a story within this feature.

**Depends on**: All previous features in this capability

- 21-configurable-hierarchy (config loading)
- 32-container-model (tree traversal)
- 43-naming-parsing (BSP and name parsing)
- 54-outcomes-ledger (ledger operations)
- 65-status-derivation (state machine)

## Requirements

### Command Structure

All spec domain commands are subcommands of `spx spx`:

```
spx spx status [path]     # Display tree with states
spx spx next [path]       # Find next incomplete work item
spx spx create <type>     # Create container with correct BSP
spx spx claim <path>      # Assert tests pass, update ledger
spx spx validate [path]   # Precommit validation (no test runs)
spx spx verify [path]     # Run claimed tests, detect regressions
spx spx test [path]       # Run all tests (no ledger modification)
```

### Common Behavior

All commands:

- Load configuration via resolution chain
- Support `--config` flag to override
- Support `--json` flag for machine-readable output
- Exit 0 on success, non-zero on failure
- Complete in <100ms for cached operations

### Performance Target

| Operation       | Target    | Notes                     |
| --------------- | --------- | ------------------------- |
| status (cached) | <100ms    | No test execution         |
| next            | <100ms    | Traversal only            |
| create          | <100ms    | Directory + file creation |
| validate        | <100ms    | Blob comparison only      |
| claim           | <5s       | Runs container tests      |
| verify          | <30s      | Runs all claimed tests    |
| test            | unbounded | Runs all tests            |

## Stories

### 21-status-command

Display tree with container states.

```
spx spx status [path]
  --format text|json|table|markdown
  --depth N                          # Limit tree depth
```

### 32-next-command

Find next incomplete work item (lowest BSP not Passing).

```
spx spx next [path]
  --format text|json
```

Returns fully-qualified path to next work item.

### 43-create-command

Create new container with correct BSP.

```
spx spx create <type> [--after BSP] [--name slug]
  type: capability|feature|story (from config)
  --after: Insert after specific BSP (default: append)
  --name: Specify slug (default: prompt or generate)
```

### 54-claim-command

Run tests and update outcomes.yaml if passing.

```
spx spx claim <path>
  --force    # Update even if tests fail (records partial)
```

### 65-validate-command

Precommit validation without running tests.

```
spx spx validate [path]
  --fix      # Auto-fix what can be fixed
```

Checks:

- Phantom entries (test files deleted)
- Stale blobs (spec/test modified)
- Does NOT run tests

### 76-verify-command

Run claimed tests to detect regressions.

```
spx spx verify [path]
  --update   # Update ledger with new results
```

Only runs tests listed in outcomes.yaml.

### 87-test-command

Run all tests without modifying ledger.

```
spx spx test [path]
  --watch    # Watch mode
  --filter   # Test name filter
```

Delegates to configured test runner (vitest, pytest, etc.).

## Test Strategy

| Component         | Level | Harness | Rationale                  |
| ----------------- | ----- | ------- | -------------------------- |
| Argument parsing  | 1     | -       | Pure CLI parsing           |
| Output formatting | 1     | -       | Pure string formatting     |
| Command execution | 3     | e2e     | Full CLI with real project |

### Escalation Rationale

- **1 → 3**: Level 1 tests parsing/formatting; Level 3 tests full command execution since commands integrate all previous features

## Outcomes

### 1. Status shows tree with states

```gherkin
GIVEN a spec tree with mixed states
WHEN running `spx spx status`
THEN tree is displayed with status indicators
AND containers are ordered by BSP
AND response time is <100ms
```

| File                                   | Level | Harness |
| -------------------------------------- | ----- | ------- |
| [status.e2e](tests/status.e2e.test.ts) | 3     | e2e     |

---

### 2. Next finds lowest incomplete item

```gherkin
GIVEN a spec tree with some Passing, some Pending
WHEN running `spx spx next`
THEN fully-qualified path to lowest-BSP non-Passing item is returned
AND response time is <100ms
```

| File                               | Level | Harness |
| ---------------------------------- | ----- | ------- |
| [next.e2e](tests/next.e2e.test.ts) | 3     | e2e     |

---

### 3. Create generates correct BSP

```gherkin
GIVEN a capability with features at BSP 21, 32, 43
WHEN running `spx spx create feature`
THEN new feature is created at BSP 71 (append algorithm)
AND directory follows naming convention
AND spec file is created with template
```

| File                                   | Level | Harness |
| -------------------------------------- | ----- | ------- |
| [create.e2e](tests/create.e2e.test.ts) | 3     | e2e     |

---

### 4. Claim updates ledger on passing tests

```gherkin
GIVEN a container with passing tests
WHEN running `spx spx claim <path>`
THEN outcomes.yaml is created/updated
AND spec_blob matches current spec
AND test entries have current blobs and timestamps
```

| File                                 | Level | Harness |
| ------------------------------------ | ----- | ------- |
| [claim.e2e](tests/claim.e2e.test.ts) | 3     | e2e     |

---

### 5. Validate detects issues without running tests

```gherkin
GIVEN a container with stale spec_blob
WHEN running `spx spx validate`
THEN stale warning is reported
AND exit code is non-zero
AND no tests are executed
```

| File                                       | Level | Harness |
| ------------------------------------------ | ----- | ------- |
| [validate.e2e](tests/validate.e2e.test.ts) | 3     | e2e     |

---

### 6. Verify runs only claimed tests

```gherkin
GIVEN a container with 3 tests in outcomes.yaml
AND 2 additional tests not yet claimed
WHEN running `spx spx verify`
THEN only the 3 claimed tests are executed
AND regression is reported if any fail with unchanged blob
```

| File                                   | Level | Harness |
| -------------------------------------- | ----- | ------- |
| [verify.e2e](tests/verify.e2e.test.ts) | 3     | e2e     |

## Architectural Constraints

| ADR       | Constraint                                    |
| --------- | --------------------------------------------- |
| (pending) | All commands under `spx spx` namespace        |
| (pending) | <100ms target for non-test-running operations |
| (pending) | JSON output available for all commands        |
