# Story: Validation Output Enhancements

## Context

The `spx validation` commands currently produce minimal output compared to the original `validate.ts` script. Users lack visibility into:

- What directories/files are being validated (scope)
- Which step is currently running (progress)
- How long each step takes (timing)
- Overall success/failure summary

This story adds essential context to validation output while maintaining the CLI's minimal style.

## Functional Requirements

### FR1: Add timing to ValidationCommandResult

```gherkin
GIVEN a validation step completes
WHEN the result is returned
THEN it includes the duration in milliseconds
```

#### Files created/modified

1. `src/commands/validation/types.ts` [modify]: Add `durationMs?: number` to `ValidationCommandResult`
2. `src/commands/validation/typescript.ts` [modify]: Track and return timing
3. `src/commands/validation/lint.ts` [modify]: Track and return timing
4. `src/commands/validation/circular.ts` [modify]: Track and return timing
5. `src/commands/validation/knip.ts` [modify]: Track and return timing

### FR2: Add step numbering and timing to output

```gherkin
GIVEN spx validation all runs
WHEN each step completes
THEN output shows step number, name, result, and timing
```

Example output:

```
[1/4] Circular dependencies: ✓ None found (0.6s)
[2/4] Knip: 8 unused files (informational)
[3/4] ESLint: ✓ No issues found (0.8s)
[4/4] TypeScript: ✓ No type errors (1.3s)

✓ Validation passed (2.7s total)
```

#### Files created/modified

1. `src/commands/validation/all.ts` [modify]: Add step numbering, timing display, summary line

### FR3: Add scope header showing validated directories

```gherkin
GIVEN spx validation all runs with full scope
WHEN the command starts
THEN output shows the directories being validated
```

Example output:

```
Scope: bin, eslint-rules, scripts, specs, src, tests
```

#### Files created/modified

1. `src/commands/validation/all.ts` [modify]: Add scope header before validation steps

### FR4: Format timing consistently

```gherkin
GIVEN a duration in milliseconds
WHEN formatting for display
THEN durations < 1000ms show as "Xms"
AND durations >= 1000ms show as "X.Xs"
```

#### Files created/modified

1. `src/commands/validation/format.ts` [new]: Pure function `formatDuration(ms: number): string`

## Testing Strategy

> Use `/testing-typescript` skill to understand testing strategy.

### Level Assignment

| Component                  | Level | Justification                    |
| -------------------------- | ----- | -------------------------------- |
| `formatDuration()`         | 1     | Pure function, no external deps  |
| `formatStepOutput()`       | 1     | Pure function formatting strings |
| `formatSummary()`          | 1     | Pure function formatting summary |
| CLI output with real tools | 2     | Integration test verifies wiring |

### When to Escalate

This story stays at Level 1 for the formatting functions because:

- We're testing string formatting, not validation execution
- DI provides sufficient confidence that formatting is correct

Level 2 integration tests verify the CLI produces expected output format.

## Unit Tests (Level 1)

```typescript
// specs/.../story-48_validation-output-enhancements/tests/format.test.ts
import { describe, expect, it } from "vitest";
import { formatDuration, formatStepOutput, formatSummary } from "../../../../../../../src/commands/validation/format.js";

describe("formatDuration", () => {
  it("GIVEN duration < 1000ms WHEN formatting THEN shows milliseconds", () => {
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(0)).toBe("0ms");
  });

  it("GIVEN duration >= 1000ms WHEN formatting THEN shows seconds with one decimal", () => {
    expect(formatDuration(1000)).toBe("1.0s");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(2750)).toBe("2.8s");
  });
});

describe("formatStepOutput", () => {
  it("GIVEN step result WHEN formatting THEN includes step number and timing", () => {
    const output = formatStepOutput({
      stepNumber: 1,
      totalSteps: 4,
      name: "Circular dependencies",
      result: "✓ None found",
      durationMs: 600,
    });

    expect(output).toBe("[1/4] Circular dependencies: ✓ None found (0.6s)");
  });
});

describe("formatSummary", () => {
  it("GIVEN all steps passed WHEN formatting summary THEN shows success", () => {
    const summary = formatSummary({ success: true, totalDurationMs: 2700 });

    expect(summary).toBe("✓ Validation passed (2.7s total)");
  });

  it("GIVEN any step failed WHEN formatting summary THEN shows failure", () => {
    const summary = formatSummary({ success: false, totalDurationMs: 1500 });

    expect(summary).toBe("✗ Validation failed (1.5s total)");
  });
});
```

## Integration Tests (Level 2)

```typescript
// specs/.../story-48_validation-output-enhancements/tests/output.integration.test.ts
import { execa } from "execa";
import { describe, expect, it } from "vitest";

describe("Validation CLI Output Format", () => {
  it("GIVEN spx validation all WHEN running THEN shows step numbers", async () => {
    const { stdout, exitCode } = await execa("node", [CLI_PATH, "validation", "all"]);

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/\[\d+\/\d+\]/); // Step numbering pattern
  });

  it("GIVEN spx validation all WHEN running THEN shows timing", async () => {
    const { stdout } = await execa("node", [CLI_PATH, "validation", "all"]);

    expect(stdout).toMatch(/\(\d+(\.\d)?s?\)/); // Timing pattern like (0.6s) or (500ms)
  });

  it("GIVEN spx validation all WHEN passing THEN shows summary line", async () => {
    const { stdout } = await execa("node", [CLI_PATH, "validation", "all"]);

    expect(stdout).toContain("Validation passed");
    expect(stdout).toMatch(/total\)$/m); // Ends with "total)"
  });

  it("GIVEN --quiet flag WHEN running THEN suppresses progress output", async () => {
    const { stdout } = await execa("node", [CLI_PATH, "validation", "all", "--quiet"]);

    // Quiet mode should produce minimal or no output on success
    expect(stdout).not.toMatch(/\[\d+\/\d+\]/);
  });
});
```

## Architectural Requirements

### Relevant ADRs

1. [Validation Script Testability](../decisions/adr-001_validation-script-testability.md) - DI pattern, pure functions

## Quality Requirements

### QR1: Type Safety

**Requirement:** All formatting functions must have TypeScript type annotations
**Target:** 100% type coverage
**Validation:** `pnpm run typecheck` passes with no errors

### QR2: Pure Functions

**Requirement:** Formatting logic must be pure functions (no side effects)
**Target:** All formatting in `src/commands/validation/format.ts`
**Validation:** Unit tests verify output without mocking

### QR3: Backward Compatibility

**Requirement:** `--quiet` mode behavior must be preserved
**Target:** Quiet mode suppresses new progress output
**Validation:** Integration test verifies quiet behavior

## Completion Criteria

- [ ] All Level 1 unit tests pass for formatting functions
- [ ] All Level 2 integration tests pass for CLI output
- [ ] `ValidationCommandResult` includes optional `durationMs` field
- [ ] `spx validation all` shows step numbering `[N/M]`
- [ ] `spx validation all` shows timing for each step
- [ ] `spx validation all` shows summary line with total time
- [ ] `--quiet` flag suppresses progress output
- [ ] No mocking used (DI pattern throughout)
