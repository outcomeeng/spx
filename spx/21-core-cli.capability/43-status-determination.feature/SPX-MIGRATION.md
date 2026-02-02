# SPX Migration Log: 43-status-determination.feature

## Source

- Original location: `specs/work/done/capability-21_core-cli/feature-43_status-determination/`
- Worktree reference: `../spx-cli_pre-spx`

## Stories and Graduated Tests (from original DONE.md files)

### story-21_state-machine

**DONE.md date:** 2026-01-04

| Requirement                       | Legacy Location                                                            | SPX Location               |
| --------------------------------- | -------------------------------------------------------------------------- | -------------------------- |
| FR1: Three-state model (no tests) | `tests/unit/status/state.test.ts::GIVEN no tests dir THEN OPEN`            | `tests/state.unit.test.ts` |
| FR1: Three-state model (empty)    | `tests/unit/status/state.test.ts::GIVEN empty tests dir THEN OPEN`         | `tests/state.unit.test.ts` |
| FR1: IN_PROGRESS state            | `tests/unit/status/state.test.ts::GIVEN files no DONE.md THEN IN_PROGRESS` | `tests/state.unit.test.ts` |
| FR1: DONE state                   | `tests/unit/status/state.test.ts::GIVEN DONE.md and files THEN DONE`       | `tests/state.unit.test.ts` |
| FR2: Edge case                    | `tests/unit/status/state.test.ts::GIVEN only DONE.md THEN DONE`            | `tests/state.unit.test.ts` |

**Migration Status:**

- [x] SPX tests created matching graduated tests
- [x] Legacy tests removed (git rm)

---

### story-32_detect-tests-dir

**DONE.md date:** 2026-01-04

| Requirement                 | Legacy Location                                                                                            | SPX Location                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------- |
| FR1: Check if tests/ exists | `tests/integration/status/state.integration.test.ts::GIVEN work item with tests dir THEN returns true`     | `tests/state.integration.test.ts` |
| FR1: No tests/ directory    | `tests/integration/status/state.integration.test.ts::GIVEN work item without tests dir THEN returns false` | `tests/state.integration.test.ts` |
| FR1: Nonexistent path       | `tests/integration/status/state.integration.test.ts::GIVEN nonexistent work item path THEN returns false`  | `tests/state.integration.test.ts` |
| FR2: Empty tests directory  | `tests/integration/status/state.integration.test.ts::GIVEN empty tests dir THEN returns true`              | `tests/state.integration.test.ts` |
| FR2: Tests with files       | `tests/integration/status/state.integration.test.ts::GIVEN tests dir with test files THEN returns false`   | `tests/state.integration.test.ts` |
| FR2: DONE.md exclusion      | `tests/integration/status/state.integration.test.ts::GIVEN tests dir with only DONE.md THEN returns true`  | `tests/state.integration.test.ts` |
| FR2: Dotfile exclusion      | `tests/integration/status/state.integration.test.ts::GIVEN tests dir with .gitkeep only THEN returns true` | `tests/state.integration.test.ts` |

**Migration Status:**

- [x] SPX tests created
- [x] Legacy tests removed (git rm)

---

### story-43_parse-done-md

**DONE.md date:** 2026-01-04

| Requirement                    | Legacy Location                                                                                                        | SPX Location                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| FR1: DONE.md exists            | `tests/integration/status/state.integration.test.ts::hasDoneMd > GIVEN tests dir with DONE.md THEN returns true`       | `tests/state.integration.test.ts` |
| FR1: No DONE.md                | `tests/integration/status/state.integration.test.ts::hasDoneMd > GIVEN tests dir without DONE.md THEN returns false`   | `tests/state.integration.test.ts` |
| FR2, QR2: DONE.md as directory | `tests/integration/status/state.integration.test.ts::hasDoneMd > GIVEN DONE.md as directory THEN returns false`        | `tests/state.integration.test.ts` |
| QR1: Case sensitivity          | `tests/integration/status/state.integration.test.ts::hasDoneMd > GIVEN DONE.md with different case THEN returns false` | `tests/state.integration.test.ts` |

**Migration Status:**

- [x] SPX tests created
- [x] Legacy tests removed (git rm)

---

### story-54_status-edge-cases

**DONE.md date:** 2026-01-04

| Requirement                             | Legacy Location                                                                                           | SPX Location                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------- |
| FR1: Permission errors                  | `tests/integration/status/state.integration.test.ts::GIVEN non-existent work item THEN throws`            | `tests/state.integration.test.ts` |
| FR2: Status orchestration (OPEN)        | `tests/integration/status/state.integration.test.ts::GIVEN no tests dir THEN returns OPEN`                | `tests/state.integration.test.ts` |
| FR2: Status orchestration (IN_PROGRESS) | `tests/integration/status/state.integration.test.ts::GIVEN tests but no DONE.md THEN returns IN_PROGRESS` | `tests/state.integration.test.ts` |
| FR2: Status orchestration (DONE)        | `tests/integration/status/state.integration.test.ts::GIVEN DONE.md THEN returns DONE`                     | `tests/state.integration.test.ts` |
| FR2: Empty tests dir                    | `tests/integration/status/state.integration.test.ts::GIVEN empty tests dir THEN returns OPEN`             | `tests/state.integration.test.ts` |
| FR2: Only DONE.md                       | `tests/integration/status/state.integration.test.ts::GIVEN only DONE.md THEN returns DONE`                | `tests/state.integration.test.ts` |
| FR2: DONE.md as directory               | `tests/integration/status/state.integration.test.ts::GIVEN DONE.md as directory THEN returns IN_PROGRESS` | `tests/state.integration.test.ts` |
| FR3: Caching performance                | `tests/integration/status/state.integration.test.ts::Status determination performance`                    | `tests/state.integration.test.ts` |

**Migration Status:**

- [x] SPX tests created
- [x] Legacy tests removed (git rm)

---

## Legacy Test Files and Contributing Stories

| Legacy File                                          | Contributing Stories         | Total Tests |
| ---------------------------------------------------- | ---------------------------- | ----------- |
| `tests/unit/status/state.test.ts`                    | story-21                     | 5           |
| `tests/integration/status/state.integration.test.ts` | story-32, story-43, story-54 | 19          |

## Feature-Level Summary

| Story    | Tests in DONE.md | SPX Tests Created |
| -------- | ---------------- | ----------------- |
| story-21 | 5                | ✓                 |
| story-32 | 7                | ✓                 |
| story-43 | 4                | ✓                 |
| story-54 | 8                | ✓                 |

## Coverage Verification (Feature Level)

| Scope                  | Legacy Tests | Legacy Coverage   | SPX Coverage      | Match |
| ---------------------- | ------------ | ----------------- | ----------------- | ----- |
| All 4 stories combined | 24 tests     | 86.3% on state.ts | 86.3% on state.ts | ✓     |

## Completed

- **Date:** 2026-02-02
- **Legacy tests removed:**
  - `git rm tests/unit/status/state.test.ts`
  - `git rm tests/integration/status/state.integration.test.ts`
- **Coverage verified:** 24 tests, 86.3% on state.ts (identical)

## Legacy Tests to Remove (after verification)

```bash
git rm tests/unit/status/state.test.ts
git rm tests/integration/status/state.integration.test.ts
```

## Old Specs to Remove (after verification)

```bash
git rm -r specs/work/done/capability-21_core-cli/feature-43_status-determination/
```

Note: The old specs may have already been removed during initial migration. Use `|| true` to handle gracefully.
