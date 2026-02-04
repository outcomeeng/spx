# Feature: Status Derivation

## Purpose

Derive container state from outcomes.yaml ledger data and implement rollup logic for non-leaf containers. States communicate what action is required, not just the situation.

**Depends on**:

- 32-container-model (leaf detection, tree traversal)
- 54-outcomes-ledger (reading ledger data)

## Requirements

### State Machine

Five states, ordered by priority (highest first):

| State     | Priority | Condition                               | Required Action       |
| --------- | -------- | --------------------------------------- | --------------------- |
| Regressed | 1        | Was passing, now fails, blobs unchanged | Investigate and fix   |
| Stale     | 2        | Spec or test blob changed since commit  | Re-commit             |
| Pending   | 3        | Tests exist, not all passing            | Fix code or fix tests |
| Unknown   | 4        | No outcomes.yaml or test links broken   | Write tests           |
| Passing   | 5        | All tests pass, blobs unchanged         | None                  |

Priority determines rollup: parent takes highest-priority (worst) child state.

### Leaf Container Status

For leaf containers (innermost level), derive status by:

1. Check if `outcomes.yaml` exists → if not, **Unknown**
2. Check if all test file links resolve → if not, **Unknown**
3. Compare `spec_blob` to current spec → if different, **Stale**
4. Compare each test `blob` to current file → if different, **Stale**
5. Run tests (or check cached results) → if any fail:
   - If blob unchanged since last pass → **Regressed**
   - Otherwise → **Pending**
6. All tests pass with matching blobs → **Passing**

### Non-Leaf Container Status (Rollup)

For non-leaf containers, derive status from children:

1. Collect status of all child containers (recursive)
2. Return highest-priority (worst) child status
3. If no children exist → **Unknown**

Example:

```
capability (Pending) ← worst of children
├── feature-21 (Passing)
└── feature-32 (Pending) ← worst of children
    ├── story-21 (Passing)
    └── story-32 (Pending)
```

### Transition Detection

Detect and report state transitions:

| Previous | Current   | Transition Type |
| -------- | --------- | --------------- |
| Unknown  | Pending   | Progress        |
| Pending  | Passing   | Complete        |
| Passing  | Stale     | Needs re-commit |
| Passing  | Regressed | Regression      |
| Stale    | Passing   | Re-verified     |

Transitions are used for:

- Commit hooks (block on regression)
- Progress reporting
- CI notifications

### Cached vs Fresh Status

Two modes of status derivation:

**Cached** (fast, for display):

- Read outcomes.yaml
- Compare blobs
- Don't run tests
- Assume last test results still valid if blobs match

**Fresh** (accurate, for validation):

- Read outcomes.yaml
- Compare blobs
- Run tests to verify current state
- Update cached results

## Test Strategy

| Component              | Level | Harness | Rationale                   |
| ---------------------- | ----- | ------- | --------------------------- |
| State priority         | 1     | -       | Pure comparison logic       |
| Leaf status logic      | 1     | -       | Pure derivation from data   |
| Rollup logic           | 1     | -       | Pure aggregation            |
| Transition detection   | 1     | -       | Pure state comparison       |
| Full status derivation | 2     | cli     | Needs real filesystem + git |
| Regression detection   | 2     | cli     | Needs real test execution   |

### Escalation Rationale

- **1 → 2**: Level 1 proves logic with mock data; Level 2 confirms it works with real ledgers and test execution

## Outcomes

### 1. Missing ledger yields Unknown

```gherkin
GIVEN a container with no outcomes.yaml
WHEN deriving status
THEN status is Unknown
AND message indicates tests need to be written
```

| File                                               | Level | Harness |
| -------------------------------------------------- | ----- | ------- |
| [leaf-status.unit](tests/leaf-status.unit.test.ts) | 1     | -       |

---

### 2. Stale spec blob is detected

```gherkin
GIVEN a container with outcomes.yaml
AND spec_blob in ledger differs from current spec file blob
WHEN deriving status
THEN status is Stale
AND message suggests re-commit
```

| File                                               | Level | Harness |
| -------------------------------------------------- | ----- | ------- |
| [leaf-status.unit](tests/leaf-status.unit.test.ts) | 1     | -       |

---

### 3. Regression is detected

```gherkin
GIVEN a container with outcomes.yaml showing test passed
AND test blob unchanged since passing
AND test now fails
WHEN deriving status
THEN status is Regressed
AND message identifies the regressed test
```

| File                                                               | Level | Harness |
| ------------------------------------------------------------------ | ----- | ------- |
| [regression-detection.int](tests/regression-detection.int.test.ts) | 2     | cli     |

---

### 4. Parent status rolls up from children

```gherkin
GIVEN a feature with 2 stories
AND story-21 is Passing
AND story-32 is Pending
WHEN deriving feature status
THEN feature status is Pending (worst child)
```

| File                                                 | Level | Harness |
| ---------------------------------------------------- | ----- | ------- |
| [rollup-logic.unit](tests/rollup-logic.unit.test.ts) | 1     | -       |

---

### 5. All passing yields Passing

```gherkin
GIVEN a container with outcomes.yaml
AND spec_blob matches current spec
AND all test blobs match current files
AND all tests pass
WHEN deriving status
THEN status is Passing
```

| File                                               | Level | Harness |
| -------------------------------------------------- | ----- | ------- |
| [leaf-status.unit](tests/leaf-status.unit.test.ts) | 1     | -       |

---

### 6. State transition is reported

```gherkin
GIVEN previous status was Passing
AND current status is Regressed
WHEN comparing states
THEN transition type is "Regression"
AND transition is flagged as blocking
```

| File                                                           | Level | Harness |
| -------------------------------------------------------------- | ----- | ------- |
| [state-transitions.unit](tests/state-transitions.unit.test.ts) | 1     | -       |

## Architectural Constraints

| ADR       | Constraint                                        |
| --------- | ------------------------------------------------- |
| (pending) | Priority-based rollup (worst state wins)          |
| (pending) | Blob comparison for staleness, not timestamps     |
| (pending) | Regression requires unchanged blob + test failure |
