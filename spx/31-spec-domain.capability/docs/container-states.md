# Container States

Each container is in exactly one state. States communicate **what action is needed**, not just the situation.

## State Definitions

| State         | Condition                           | Required Action     |
| ------------- | ----------------------------------- | ------------------- |
| **Unknown**   | No tests exist                      | Write tests         |
| **Pending**   | Tests exist, not all claimed        | Fix code or claim   |
| **Stale**     | Descendant `outcomes_blob` mismatch | Re-claim            |
| **Passing**   | All tests pass, blobs match         | None                |
| **Regressed** | Claimed test fails                  | Investigate and fix |

## State Priority

States are mutually exclusive. When multiple conditions could apply, use this priority (highest to lowest):

```
Regressed > Stale > Pending > Unknown > Passing
```

A container showing "Regressed" means a claimed test now fails — this takes priority over staleness or pending tests.

## State Derivation

### Leaf Containers

Leaf containers (innermost level) have no descendants. Their state is computed from local tests only.

```typescript
function leafState(container: Container): State {
  const tests = findTests(container);
  const ledger = loadLedger(container);

  if (tests.length === 0) {
    return "Unknown";
  }

  if (!ledger) {
    return "Pending";
  }

  const claimedTests = ledger.tests.map(t => t.file);
  const failingClaimed = claimedTests.filter(t => !testPasses(t));

  if (failingClaimed.length > 0) {
    return "Regressed";
  }

  const unclaimed = tests.filter(t => !claimedTests.includes(t));
  if (unclaimed.length > 0) {
    return "Pending";
  }

  return "Passing";
}
```

### Non-Leaf Containers

Non-leaf containers aggregate state from:

1. Their own tests (local state)
2. Their descendants (rolled-up state)

```typescript
function containerState(container: Container): State {
  const localState = leafState(container);
  const descendants = findDescendants(container);

  if (descendants.length === 0) {
    return localState;
  }

  // Check for stale descendant references
  const ledger = loadLedger(container);
  if (ledger?.descendants) {
    for (const ref of ledger.descendants) {
      const childLedger = loadLedger(ref.path);
      const actualBlob = gitBlobOf(childLedger);
      if (actualBlob !== ref.outcomes_blob) {
        return "Stale";
      }
    }
  }

  // Aggregate descendant states
  const descendantStates = descendants.map(d => containerState(d));
  const allStates = [localState, ...descendantStates];

  return worstState(allStates);
}

function worstState(states: State[]): State {
  const priority = ["Regressed", "Stale", "Pending", "Unknown", "Passing"];
  for (const state of priority) {
    if (states.includes(state)) {
      return state;
    }
  }
  return "Passing";
}
```

## State Transitions

### Unknown → Pending

Triggered when: First test file is created in `tests/` directory.

### Pending → Passing

Triggered when: All tests pass and `spx claim` is run.

### Passing → Stale

Triggered when:

- Spec file is modified (blob changes)
- Test file is modified (blob changes)
- Descendant's `outcomes.yaml` changes

### Passing → Regressed

Triggered when: A claimed test fails without spec/test modification.

### Stale → Passing

Triggered when: `spx claim` is run after modifications.

### Regressed → Passing

Triggered when: Test is fixed and `spx claim` is run.

## State Display

### Text Format

```
[PASSING]   21-core.capability/32-auth.feature/
[PENDING]   21-core.capability/54-billing.feature/
[STALE]     37-reports.capability/
[REGRESSED] 54-export.capability/21-csv.feature/
[UNKNOWN]   54-export.capability/32-pdf.feature/
```

### JSON Format

```json
{
  "path": "21-core.capability/32-auth.feature/",
  "state": "Passing",
  "localState": "Passing",
  "descendantStates": {
    "21-login.story/": "Passing",
    "32-logout.story/": "Passing"
  }
}
```

## Rollup Examples

### All Passing

```
capability: Passing
├── feature-1: Passing
│   ├── story-1: Passing
│   └── story-2: Passing
└── feature-2: Passing
    └── story-3: Passing
```

### One Regressed (Bubbles Up)

```
capability: Regressed       ← worst of descendants
├── feature-1: Passing
└── feature-2: Regressed    ← worst of descendants
    ├── story-3: Passing
    └── story-4: Regressed  ← claimed test fails
```

### Stale Parent (Child Changed)

```
capability: Stale           ← child blob mismatch
├── feature-1: Passing
└── feature-2: Passing      ← just re-claimed, blob changed
    └── story-3: Passing
```

### Mixed States

```
capability: Regressed       ← worst is Regressed
├── feature-1: Stale        ← child changed
│   └── story-1: Passing    ← just re-claimed
├── feature-2: Pending      ← unclaimed tests
│   └── story-2: Unknown    ← no tests yet
└── feature-3: Regressed    ← claimed test fails
    └── story-3: Regressed
```

## Implementation Notes

### Caching

State computation can be expensive for deep trees. Cache results keyed by:

- Container path
- Ledger blob SHA
- Descendant ledger blob SHAs

Invalidate cache when any blob changes.

### Lazy Evaluation

For `spx status --quick`, compute only top-level states without recursing into all descendants. Show aggregate without breakdown.

### Test Execution

State computation does **not** run tests by default. It reads the ledger and checks blobs. Use `spx verify` to actually run claimed tests.
