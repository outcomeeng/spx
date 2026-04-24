# Feature: E2E Workflow

## Observable Outcome

Complete end-to-end capability tests verify the entire workflow:

- **Performance**: Status analysis completes in <100ms for 50 work items
- **Correctness**: All work item states are accurately detected
- **Formats**: All output formats render correctly
- **Reliability**: Works across different repository structures

This feature contains the E2E tests that prove Capability-21 is complete.

## Architectural Requirements

### Relevant ADRs

1. [**ADR-003: E2E Fixture Generation Strategy**](../003-e2e-fixture-generation.adr.md) - Programmatic fixture generation with faker.js
   - `generateFixtureTree(config)` - Pure function to create tree structure
   - `materializeFixture(tree)` - Write to `os.tmpdir()`, return cleanup handle
   - `PRESETS` object with `MINIMAL`, `SHALLOW_50`, `DEEP_50`, `FAN_10_LEVEL_3`

## Testing Strategy

> Use `/testing-typescript` skill to understn

### Level Assignment

| Component         | Level | Justification                              |
| ----------------- | ----- | ------------------------------------------ |
| Fixture generator | 1     | Pure function, no I/O, unit testable       |
| Fixture writer    | 2     | Filesystem I/O, needs real tmpdir          |
| E2E validation    | 3     | Full CLI execution against generated repos |

### Escalation Rationale

- **1 → 2**: Fixture writer must verify actual files exist on disk
- **2 → 3**: E2E tests verify the full CLI reads generated fixtures correctly under performance targets

## Stories

| Story | Name              | Level | Description                                    |
| ----- | ----------------- | ----- | ---------------------------------------------- |
| 21    | fixture-generator | 1     | `generateFixtureTree()` + `PRESETS` object     |
| 32    | fixture-writer    | 2     | `materializeFixture()` + cleanup handling      |
| 43    | e2e-validation    | 3     | Performance, formats, and error scenario tests |

### story-21: Fixture Generator (Level 1)

Implements `generateFixtureTree(config)` and `PRESETS` object. Pure function that creates tree structures with faker.js names following `specs/templates/structure.yaml`. Unit testable with no I/O.

### story-32: Fixture Writer (Level 2)

Implements `materializeFixture(tree)` that writes tree to `os.tmpdir()`. Returns `MaterializedFixture` with path and cleanup function. Integration tests verify filesystem operations.

### story-43: E2E Validation (Level 3)

All E2E tests using generated fixtures:

- Performance benchmarks (<100ms for 50 items)
- Multi-format validation (text, JSON, markdown, table)
- Error scenarios (missing specs, invalid formats, etc.)

## E2E Tests (Level 3)

```typescript
// tests/e2e/core-cli.e2e.test.ts
import { createFixture, PRESETS } from "@/tests/helpers/fixture-generator";

describe("Capability: Core CLI - E2E", () => {
  it("GIVEN 50 work items WHEN running spx status --json THEN completes in <100ms", async () => {
    const fixture = await createFixture(PRESETS.SHALLOW_50);

    try {
      const startTime = Date.now();
      const { stdout, exitCode } = await execa("node", [
        "bin/spx.js",
        "status",
        "--json",
      ], {
        cwd: fixture.path,
      });
      const elapsed = Date.now() - startTime;

      expect(exitCode).toBe(0);
      expect(elapsed).toBeLessThan(100);

      const result = JSON.parse(stdout);
      expect(
        result.summary.done + result.summary.inProgress + result.summary.open,
      ).toBeGreaterThanOrEqual(50);
    } finally {
      await fixture.cleanup();
    }
  });

  it("GIVEN fixture WHEN requesting different formats THEN all render correctly", async () => {
    const fixture = await createFixture(PRESETS.FAN_10_LEVEL_3);

    try {
      const formats = ["text", "json", "markdown", "table"];
      for (const format of formats) {
        const args = format === "text"
          ? ["status"]
          : ["status", "--format", format];

        const { exitCode } = await execa("node", ["bin/spx.js", ...args], {
          cwd: fixture.path,
        });
        expect(exitCode).toBe(0);
      }
    } finally {
      await fixture.cleanup();
    }
  });
});
```

## Capability Contribution

This feature provides the E2E tests that prove Capability-21 is complete and meets its success metric (<100ms for 50 work items).

## Completion Criteria

- [ ] All 3 stories completed
- [ ] Fixture generator produces valid trees (Level 1 tests pass)
- [ ] Fixture writer creates correct filesystem structure (Level 2 tests pass)
- [ ] E2E tests pass with generated fixtures (Level 3 tests pass)
- [ ] Success metric achieved: <100ms for 50 work items
- [ ] All output formats work end-to-end
- [ ] Error scenarios handled gracefully

**Note**: This feature marks Capability-21 as DONE when complete.
