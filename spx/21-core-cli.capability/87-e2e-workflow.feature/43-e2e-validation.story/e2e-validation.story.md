# Story: E2E Validation

## Functional Requirements

### FR1: Performance benchmarks

```gherkin
GIVEN generated fixture with 50 work items
WHEN running spx status --json
THEN complete in less than 100ms
```

This is the core success metric for Capability-21.

#### Files created/modified

1. `tests/e2e/performance.e2e.test.ts` [new]: Performance benchmark tests

### FR2: Multi-format validation

```gherkin
GIVEN generated fixture
WHEN running status with each format option (text, json, markdown, table)
THEN all formats render correctly with consistent data
```

#### Files created/modified

1. `tests/e2e/formats.e2e.test.ts` [new]: Format validation tests

### FR3: Error scenario handling

```gherkin
GIVEN various error conditions
WHEN running spx CLI
THEN handle errors gracefully with helpful messages and correct exit codes
```

Error scenarios:

- Missing specs/ directory
- Invalid format option
- Empty specs directory
- Invalid command

#### Files created/modified

1. `tests/e2e/errors.e2e.test.ts` [new]: Error handling tests

## Architectural Requirements

### Relevant ADRs

1. **ADR-003: E2E Fixture Generation Strategy** - Use `createFixture()` for all E2E tests

### Dependencies

- story-21_fixture-generator must be complete
- story-32_fixture-writer must be complete

## Testing Strategy

### Level Assignment

| Component              | Level | Justification                      |
| ---------------------- | ----- | ---------------------------------- |
| Performance benchmarks | 3     | Real CLI execution, timing         |
| Format validation      | 3     | Full CLI workflow                  |
| Error handling         | 3     | Real process exit codes and stderr |

### When to Escalate

This story uses Level 3 because:

- Must measure actual CLI process execution time
- Verifies complete end-to-end workflow
- Tests real process exit codes and error messages

## E2E Tests (Level 3)

### Performance Tests

```typescript
// tests/e2e/performance.e2e.test.ts
import { createFixture, PRESETS } from "@/tests/helpers/fixture-generator";
import type { MaterializedFixture } from "@/tests/helpers/fixture-writer";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";

describe("E2E: Performance", () => {
  let fixture: MaterializedFixture;

  afterEach(async () => {
    if (fixture) await fixture.cleanup();
  });

  it("GIVEN 50 work items WHEN running status --json THEN completes in <100ms", async () => {
    fixture = await createFixture(PRESETS.SHALLOW_50);

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
    )
      .toBeGreaterThanOrEqual(50);
  });

  it("GIVEN 50 work items WHEN running status (text) THEN completes in <100ms", async () => {
    fixture = await createFixture(PRESETS.SHALLOW_50);

    const startTime = Date.now();
    const { exitCode } = await execa("node", ["bin/spx.js", "status"], {
      cwd: fixture.path,
    });
    const elapsed = Date.now() - startTime;

    expect(exitCode).toBe(0);
    expect(elapsed).toBeLessThan(100);
  });

  it("GIVEN 50 work items WHEN running 5 times THEN performance consistent", async () => {
    fixture = await createFixture(PRESETS.SHALLOW_50);
    const times: number[] = [];

    for (let i = 0; i < 5; i++) {
      const startTime = Date.now();
      await execa("node", ["bin/spx.js", "status", "--json"], {
        cwd: fixture.path,
      });
      times.push(Date.now() - startTime);
    }

    expect(Math.max(...times)).toBeLessThan(100);
  });
});
```

### Format Tests

```typescript
// tests/e2e/formats.e2e.test.ts
import { createFixture, PRESETS } from "@/tests/helpers/fixture-generator";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";

describe("E2E: Output Formats", () => {
  let fixture: MaterializedFixture;

  afterEach(async () => {
    if (fixture) await fixture.cleanup();
  });

  it("GIVEN fixture WHEN running status (text) THEN renders tree correctly", async () => {
    fixture = await createFixture(PRESETS.FAN_10_LEVEL_3);

    const { stdout, exitCode } = await execa("node", ["bin/spx.js", "status"], {
      cwd: fixture.path,
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("capability-");
    expect(stdout).toContain("feature-");
    expect(stdout).toContain("story-");
  });

  it("GIVEN fixture WHEN running status --json THEN produces valid JSON", async () => {
    fixture = await createFixture(PRESETS.FAN_10_LEVEL_3);

    const { stdout, exitCode } = await execa("node", [
      "bin/spx.js",
      "status",
      "--json",
    ], {
      cwd: fixture.path,
    });

    expect(exitCode).toBe(0);
    expect(() => JSON.parse(stdout)).not.toThrow();

    const result = JSON.parse(stdout);
    expect(result.summary).toBeDefined();
    expect(result.capabilities).toBeInstanceOf(Array);
  });

  it("GIVEN fixture WHEN running status --format markdown THEN produces markdown", async () => {
    fixture = await createFixture(PRESETS.FAN_10_LEVEL_3);

    const { stdout, exitCode } = await execa(
      "node",
      ["bin/spx.js", "status", "--format", "markdown"],
      { cwd: fixture.path },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^# /m);
  });

  it("GIVEN fixture WHEN running status --format table THEN produces table", async () => {
    fixture = await createFixture(PRESETS.FAN_10_LEVEL_3);

    const { stdout, exitCode } = await execa(
      "node",
      ["bin/spx.js", "status", "--format", "table"],
      { cwd: fixture.path },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/\|.*\|/);
  });

  it("GIVEN fixture WHEN running all formats THEN work item counts match", async () => {
    fixture = await createFixture(PRESETS.FAN_10_LEVEL_3);

    const { stdout: jsonOut } = await execa(
      "node",
      ["bin/spx.js", "status", "--json"],
      { cwd: fixture.path },
    );
    const jsonData = JSON.parse(jsonOut);
    const expectedTotal = jsonData.summary.done + jsonData.summary.inProgress
      + jsonData.summary.open;

    const { stdout: textOut } = await execa(
      "node",
      ["bin/spx.js", "status"],
      { cwd: fixture.path },
    );
    const textLines = textOut.split("\n").filter(l => l.match(/capability-|feature-|story-/));
    expect(textLines.length).toBe(expectedTotal);
  });
});
```

### Error Tests

```typescript
// tests/e2e/errors.e2e.test.ts
import { execa } from "execa";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("E2E: Error Scenarios", () => {
  it("GIVEN directory without specs/ WHEN running status THEN shows error", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "spx-test-"));

    try {
      const { exitCode, stderr } = await execa(
        "node",
        ["bin/spx.js", "status"],
        { cwd: emptyDir, reject: false },
      );

      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/specs.*not found|No specs directory/i);
    } finally {
      await rm(emptyDir, { recursive: true });
    }
  });

  it("GIVEN invalid format option WHEN running status THEN shows error", async () => {
    const { exitCode, stderr } = await execa(
      "node",
      ["bin/spx.js", "status", "--format", "invalid"],
      { reject: false },
    );

    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/Invalid format|must be one of/i);
  });

  it("GIVEN invalid command WHEN running spx THEN shows help", async () => {
    const { exitCode, stderr } = await execa(
      "node",
      ["bin/spx.js", "notacommand"],
      { reject: false },
    );

    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/Unknown command|error/i);
  });

  it("GIVEN --help flag WHEN running spx THEN shows help and exits 0", async () => {
    const { exitCode, stdout } = await execa("node", ["bin/spx.js", "--help"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("status");
  });

  it("GIVEN --version flag WHEN running spx THEN shows version", async () => {
    const { exitCode, stdout } = await execa("node", [
      "bin/spx.js",
      "--version",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/\d+\.\d+\.\d+/);
  });
});
```

## Completion Criteria

- [ ] Performance tests pass (<100ms for 50 items)
- [ ] All format tests pass (text, JSON, markdown, table)
- [ ] Error scenario tests pass
- [ ] Consistent data across all output formats
- [ ] Helpful error messages with correct exit codes
- [ ] All Level 3 E2E tests pass

**Note**: This story completes Feature 87 and marks **Capability-21 as DONE** when all E2E tests pass.
